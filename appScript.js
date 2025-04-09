// Configuration object - Replace with your own values
const CONFIG = {
  CLIENT_ID: 'YOUR_CLIENT_ID_HERE',
  CLIENT_SECRET: 'YOUR_CLIENT_SECRET_HERE',
  REFRESH_TOKEN: 'YOUR_REFRESH_TOKEN_HERE',
  CUSTOMER_ID: 'YOUR_CUSTOMER_ID_HERE', // Regular account
  LOGIN_CUSTOMER_ID: 'YOUR_MCC_ID_HERE', // MCC account if applicable
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',
  DEVELOPER_TOKEN: 'YOUR_DEVELOPER_TOKEN_HERE',
  DAYS_BEFORE: 14
};

// Function to manually refresh the access token
function refreshAccessToken() {
  const url = 'https://accounts.google.com/o/oauth2/token';
  const payload = {
    client_id: CONFIG.CLIENT_ID,
    client_secret: CONFIG.CLIENT_SECRET,
    refresh_token: CONFIG.REFRESH_TOKEN,
    grant_type: 'refresh_token'
  };
  const options = {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    throw new Error('Failed to refresh token: ' + response.getContentText());
  }
  const tokenData = JSON.parse(response.getContentText());
  PropertiesService.getScriptProperties().setProperty('accessToken', tokenData.access_token);
  Logger.log('New Access Token (first 10 chars): ' + tokenData.access_token.substring(0, 10));
  return tokenData.access_token;
}

// Function to get the access token
function getAccessToken() {
  let accessToken = PropertiesService.getScriptProperties().getProperty('accessToken');
  if (!accessToken) {
    accessToken = refreshAccessToken();
  }
  return accessToken;
}

// Main Function - UPDATED to check audience changes independently regardless of budget changes
function runMonitoring() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const budgetSheet = ss.getSheetByName('Budget Monitoring');
  const audienceSheet = ss.getSheetByName('Audience Monitoring');
  const ignoreSheet = ss.getSheetByName('campaignIgnore');
  
  const ignoreData = ignoreSheet.getDataRange().getValues().slice(1); // Skip header
  const ignoreMap = new Map(ignoreData.map(row => [
    row[2], // Change Events ID
    { tab: row[0], campaignId: row[1], date: new Date(row[3]) }
  ]));

  // Check bid and budget changes - ALWAYS check and process these changes
  Logger.log("Checking bid and budget changes...");
  const bidBudgetChanges = checkBidBudgetChanges();
  if (bidBudgetChanges.length > 0) {
    Logger.log(`Found ${bidBudgetChanges.length} bid/budget changes`);
    processChanges(budgetSheet, ignoreSheet, bidBudgetChanges, 'Budget', ignoreMap);
  } else {
    Logger.log("No bid/budget changes found");
  }
  
  // ALWAYS check keyword and audience changes regardless of whether budget changes were found
  Logger.log("Checking keyword and audience changes...");
  const kwAudienceChanges = checkKeywordAudienceChanges();
  if (kwAudienceChanges.length > 0) {
    Logger.log(`Found ${kwAudienceChanges.length} keyword/audience changes`);
    processChanges(audienceSheet, ignoreSheet, kwAudienceChanges, 'Audience', ignoreMap);
  } else {
    Logger.log("No keyword/audience changes found");
  }

  checkFourteenDayUpdates(budgetSheet, audienceSheet, ignoreSheet, ignoreMap);
}

// API Call Function
function callGoogleAdsApi(query) {
  const accessToken = getAccessToken();
  const url = `https://googleads.googleapis.com/v19/customers/${CONFIG.CUSTOMER_ID}/googleAds:searchStream`;
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': CONFIG.DEVELOPER_TOKEN,
      'login-customer-id': CONFIG.LOGIN_CUSTOMER_ID
    },
    payload: JSON.stringify({ query }),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() !== 200) {
      Logger.log(`API Error Response: ${response.getContentText()}`);
      throw new Error('API Error: ' + response.getContentText());
    }
    return JSON.parse(response.getContentText());
  } catch (e) {
    Logger.log(`API Call Error: ${e.message}`);
    // Attempt to refresh token and try again
    if (e.message.includes('401') || e.message.includes('UNAUTHENTICATED')) {
      Logger.log("Authentication error. Refreshing token and retrying...");
      refreshAccessToken();
      const newAccessToken = getAccessToken();
      options.headers['Authorization'] = `Bearer ${newAccessToken}`;
      const response = UrlFetchApp.fetch(url, options);
      return JSON.parse(response.getContentText());
    } else {
      throw e;
    }
  }
}

// Scenario 1: Detect Bid/Budget Changes - ENHANCED to include more bid strategy changes
function checkBidBudgetChanges() {
  const now = new Date();
  const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const startDatetime = Utilities.formatDate(past, 'America/Los_Angeles', "yyyy-MM-dd HH:mm:ss");
  const endDatetime = Utilities.formatDate(now, 'America/Los_Angeles', "yyyy-MM-dd HH:mm:ss");
  
  Logger.log('Bid/Budget check - startDatetime: ' + startDatetime);
  Logger.log('Bid/Budget check - endDatetime: ' + endDatetime);
  
  const query = `
    SELECT 
      change_event.change_date_time,
      change_event.campaign,
      change_event.ad_group,
      change_event.change_resource_type,
      change_event.old_resource,
      change_event.new_resource,
      campaign.name,
      ad_group.name,
      change_event.changed_fields,
      change_event.resource_change_operation
    FROM change_event
    WHERE change_event.change_date_time BETWEEN '${startDatetime}' AND '${endDatetime}'
      AND change_event.change_resource_type IN (
        'CAMPAIGN_BUDGET', 
        'AD_GROUP_BID_MODIFIER', 
        'AD_GROUP_CRITERION', 
        'CAMPAIGN', 
        'CAMPAIGN_CRITERION',
        'BIDDING_STRATEGY'
      )
    LIMIT 10000
  `;
  
  // Enhanced list of fields to monitor for bid/budget related changes
  return processChangeEvents(query, [
    'CAMPAIGN_BUDGET', 
    'AD_GROUP_BID_MODIFIER', 
    'AD_GROUP_CRITERION', 
    'CAMPAIGN',
    'CAMPAIGN_CRITERION',
    'BIDDING_STRATEGY'
  ], [
    'bidding_strategy', 
    'maximize_conversion_value', 
    'budget',
    'target_cpa',
    'target_roas',
    'cpc_bid',
    'cpv_bid',
    'cpm_bid',
    'target_spend',
    'bid_modifier'
  ]);
}

// Scenario 2: Detect Keyword & Audience Changes - UPDATED to properly include geo targeting
function checkKeywordAudienceChanges() {
  const now = new Date();
  const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startDatetime = Utilities.formatDate(past, 'America/Los_Angeles', "yyyy-MM-dd HH:mm:ss");
  const endDatetime = Utilities.formatDate(now, 'America/Los_Angeles', "yyyy-MM-dd HH:mm:ss");
  
  Logger.log('Audience check - startDatetime: ' + startDatetime);
  Logger.log('Audience check - endDatetime: ' + endDatetime);
  
  // Updated query to capture all audience and keyword related changes
  const query = `
    SELECT 
      change_event.change_date_time,
      change_event.campaign,
      change_event.ad_group,
      change_event.change_resource_type,
      change_event.old_resource,
      change_event.new_resource,
      campaign.name,
      ad_group.name,
      change_event.changed_fields,
      change_event.resource_change_operation
    FROM change_event
    WHERE change_event.change_date_time BETWEEN '${startDatetime}' AND '${endDatetime}'
    AND change_event.change_resource_type IN (
      'AD_GROUP_CRITERION', 
      'CAMPAIGN_CRITERION', 
      'CAMPAIGN',
      'AD_GROUP_AUDIENCE_VIEW',
      'CUSTOMER_NEGATIVE_CRITERION',
      'KEYWORD_PLAN',
      'KEYWORD_PLAN_CAMPAIGN_KEYWORD',
      'KEYWORD_PLAN_AD_GROUP_KEYWORD'
    )
    LIMIT 10000
  `;
  
  // Expanded list of relevant fields to filter for audiences and keywords
  return processChangeEvents(query, [
    'AD_GROUP_CRITERION', 
    'CAMPAIGN_CRITERION', 
    'CAMPAIGN',
    'AD_GROUP_AUDIENCE_VIEW',
    'CUSTOMER_NEGATIVE_CRITERION',
    'KEYWORD_PLAN',
    'KEYWORD_PLAN_CAMPAIGN_KEYWORD',
    'KEYWORD_PLAN_AD_GROUP_KEYWORD'
  ], [
    'location',
    'criterion', 
    'geo_target',
    'keyword',
    'audience',
    'user_list',
    'detailed_demographic',
    'topic',
    'placement',
    'match_type',
    'negative',
    'user_interest'
  ]);
}

// Enhanced Process Change Events with better filtering and entity level identification
function processChangeEvents(query, resourceTypes, relevantFields = null) {
  const changes = [];
  try {
    const report = callGoogleAdsApi(query);
    Logger.log(`API Response received with ${report.length} parts`);
    
    report.forEach(result => {
      if (result.results && result.results.length > 0) {
        Logger.log(`Processing ${result.results.length} results...`);
        
        result.results.forEach(row => {
          if (row.changeEvent && row.changeEvent.changeResourceType) {
            // Check if the resource type is one we're interested in
            if (resourceTypes.includes(row.changeEvent.changeResourceType)) {
              
              // Additional filtering based on changed fields if provided
              let isRelevant = true;
              if (relevantFields && row.changeEvent.changedFields) {
                isRelevant = relevantFields.some(field => 
                  row.changeEvent.changedFields.toLowerCase().includes(field.toLowerCase()));
              }
              
              if (isRelevant) {
                const campaignId = row.changeEvent.campaign ? row.changeEvent.campaign.split('/')[3] : null;
                const adGroupId = row.changeEvent.adGroup ? row.changeEvent.adGroup.split('/')[3] : null;
                
                // Determine the level at which the change occurred (Campaign, Ad Group, Keyword)
                let changeLevel = "Campaign";
                if (adGroupId) {
                  changeLevel = "Ad Group";
                  if (row.changeEvent.changeResourceType === 'AD_GROUP_CRITERION') {
                    if (row.changeEvent.changedFields && row.changeEvent.changedFields.includes("keyword")) {
                      changeLevel = "Keyword";
                    } else if (row.changeEvent.changedFields && 
                              (row.changeEvent.changedFields.includes("audience") || 
                               row.changeEvent.changedFields.includes("user_list"))) {
                      changeLevel = "Audience";
                    }
                  }
                }
                
                // Enhanced change type description
                let changeType = row.changeEvent.changeResourceType;
                if (row.changeEvent.resourceChangeOperation) {
                  changeType += ` (${row.changeEvent.resourceChangeOperation})`;
                }
                
                changes.push({
                  date: row.changeEvent.changeDateTime,
                  campaignId,
                  campaignName: row.campaign ? row.campaign.name : null,
                  adGroupId,
                  adGroupName: row.adGroup ? row.adGroup.name : null,
                  type: row.changeEvent.changeResourceType,
                  changeLevel: changeLevel,
                  operation: row.changeEvent.resourceChangeOperation || "MODIFY",
                  oldValue: JSON.stringify(row.changeEvent.oldResource),
                  newValue: JSON.stringify(row.changeEvent.newResource),
                  changedFields: row.changeEvent.changedFields || ''
                });
                
                // Log the detected change for debugging
                Logger.log(`Detected ${changeLevel} level change in ${row.campaign ? row.campaign.name : 'Unknown Campaign'} - Type: ${row.changeEvent.changeResourceType} - Changed Fields: ${row.changeEvent.changedFields || 'N/A'}`);
              }
            }
          } else {
            Logger.log('Missing changeEvent or changeResourceType in row');
          }
        });
      } else {
        Logger.log('No results found in this part of API response.');
      }
    });
  } catch (e) {
    Logger.log(`Error in processChangeEvents: ${e.message}`);
  }
  return changes;
}

// Helper function to create a human-readable summary of the change
function createHumanReadableSummary(change) {
  try {
    let summary = `${change.changeLevel} ${change.operation}: `;
    
    // Format based on change type
    if (change.type.includes('BUDGET')) {
      const oldBudget = change.oldValue ? JSON.parse(change.oldValue) : null;
      const newBudget = change.newValue ? JSON.parse(change.newValue) : null;
      
      if (oldBudget && newBudget && oldBudget.amountMicros && newBudget.amountMicros) {
        const oldAmount = parseInt(oldBudget.amountMicros) / 1000000;
        const newAmount = parseInt(newBudget.amountMicros) / 1000000;
        summary += `Budget changed from $${oldAmount.toFixed(2)} to $${newAmount.toFixed(2)}`;
      } else if (newBudget && newBudget.amountMicros && change.operation === 'CREATE') {
        const newAmount = parseInt(newBudget.amountMicros) / 1000000;
        summary += `New budget set to $${newAmount.toFixed(2)}`;
      } else {
        summary += `Budget change detected`;
      }
    } else if (change.changedFields.includes('bidding_strategy') || 
               change.type.includes('BIDDING_STRATEGY')) {
      summary += `Bidding strategy modified`;
      
      // Try to extract specific bidding strategy details if available
      if (change.oldValue && change.newValue) {
        try {
          const oldObj = JSON.parse(change.oldValue);
          const newObj = JSON.parse(change.newValue);
          
          // Check for target CPA changes
          if (oldObj.targetCpa && newObj.targetCpa) {
            const oldCpa = parseInt(oldObj.targetCpa.targetCpaMicros) / 1000000;
            const newCpa = parseInt(newObj.targetCpa.targetCpaMicros) / 1000000;
            summary += ` - Target CPA changed from $${oldCpa.toFixed(2)} to $${newCpa.toFixed(2)}`;
          }
          
          // Check for target ROAS changes
          if (oldObj.targetRoas && newObj.targetRoas) {
            const oldRoas = parseFloat(oldObj.targetRoas.targetRoas);
            const newRoas = parseFloat(newObj.targetRoas.targetRoas);
            summary += ` - Target ROAS changed from ${(oldRoas * 100).toFixed(2)}% to ${(newRoas * 100).toFixed(2)}%`;
          }
        } catch (e) {
          // If parsing fails, just use generic message
          Logger.log(`Error parsing bidding strategy details: ${e.message}`);
        }
      }
    } else if (change.type.includes('KEYWORD') || change.changedFields.includes('keyword')) {
      if (change.operation === 'CREATE') {
        summary += `Keyword added`;
      } else if (change.operation === 'REMOVE') {
        summary += `Keyword removed`;
      } else {
        summary += `Keyword modified`;
      }
      
      // Try to extract keyword text if available
      if (change.newValue) {
        try {
          const newObj = JSON.parse(change.newValue);
          if (newObj.keyword && newObj.keyword.text) {
            summary += `: "${newObj.keyword.text}"`;
            
            // Add match type if available
            if (newObj.keyword.matchType) {
              summary += ` (${newObj.keyword.matchType})`;
            }
          }
        } catch (e) {
          Logger.log(`Error parsing keyword details: ${e.message}`);
        }
      }
    } else if (change.changedFields.includes('audience') || 
               change.changedFields.includes('user_list') ||
               change.type.includes('AUDIENCE')) {
      if (change.operation === 'CREATE') {
        summary += `Audience added`;
      } else if (change.operation === 'REMOVE') {
        summary += `Audience removed`;
      } else {
        summary += `Audience targeting modified`;
      }
    } else if (change.changedFields.includes('location') || 
               change.changedFields.includes('geo_target')) {
      if (change.operation === 'CREATE') {
        summary += `Location targeting added`;
      } else if (change.operation === 'REMOVE') {
        summary += `Location targeting removed`;
      } else {
        summary += `Location targeting modified`;
      }
    } else {
      // Generic fallback
      summary += `${change.changedFields || change.type}`;
    }
    
    // Add campaign/ad group context
    if (change.adGroupName) {
      summary += ` in ad group "${change.adGroupName}"`;
    }
    
    return summary;
  } catch (e) {
    Logger.log(`Error creating human-readable summary: ${e.message}`);
    return `${change.changeLevel} ${change.operation} - ${change.type}`;
  }
}

// Fetch Performance Data - Enhanced with better error handling and logging
function getPerformanceData(campaignId, adGroupId, startDate, endDate) {
  try {
    Logger.log(`Fetching performance data for campaign ${campaignId} from ${startDate} to ${endDate}`);
    
    const query = `
      SELECT 
        campaign.id,
        metrics.average_cpc,
        metrics.ctr,
        metrics.conversions,
        metrics.clicks,
        metrics.impressions,
        metrics.search_impression_share,
        metrics.search_top_impression_share,
        metrics.search_absolute_top_impression_share
      FROM campaign
      WHERE campaign.id = '${campaignId}'
      AND segments.date BETWEEN '${startDate}' AND '${endDate}'`;
    
    // Log the query for debugging
    Logger.log(`Performance query: ${query}`);
    
    const report = callGoogleAdsApi(query);
    
    // Check if we have results
    if (!report || report.length === 0 || !report[0].results || report[0].results.length === 0) {
      Logger.log(`No performance data found for campaign ${campaignId}`);
      return {
        cpc: 0,
        ctr: 0,
        conversionRate: 0,
        auctionInsights: 'No data available',
        impressions: 0
      };
    }
    
    const metrics = report[0].results[0].metrics || {};
    const cpc = metrics.averageCpc ? (metrics.averageCpc / 1e6) : 0;
    const ctr = metrics.ctr ? (metrics.ctr * 100) : 0;
    const convRate = metrics.conversions && metrics.clicks > 0 ? 
                    (metrics.conversions / metrics.clicks * 100) : 0;
    const impressions = metrics.impressions || 0;
    
    Logger.log(`Performance metrics retrieved - CPC: ${cpc}, CTR: ${ctr}%, Conv Rate: ${convRate}%, Impressions: ${impressions}`);
    
    // Only calculate auction insights if we have impression share data
    let auctionInsights = 'N/A';
    if (metrics.searchImpressionShare) {
      auctionInsights = `Impression Share: ${(metrics.searchImpressionShare * 100).toFixed(2)}%, ` +
        `Top: ${metrics.searchTopImpressionShare ? (metrics.searchTopImpressionShare * 100).toFixed(2) : 0}%, ` +
        `Abs Top: ${metrics.searchAbsoluteTopImpressionShare ? (metrics.searchAbsoluteTopImpressionShare * 100).toFixed(2) : 0}%`;
    }
    
    return {
      cpc: cpc,
      ctr: ctr,
      conversionRate: convRate,
      auctionInsights: auctionInsights,
      impressions: impressions
    };
  } catch (e) {
    Logger.log(`Error in getPerformanceData: ${e.message}`);
    // Return default values on error
    return {
      cpc: 0,
      ctr: 0,
      conversionRate: 0,
      auctionInsights: `Error: ${e.message}`,
      impressions: 0
    };
  }
}

// Enhanced Process and Append Changes - Now includes entity level information
function processChanges(targetSheet, ignoreSheet, changes, tab, ignoreMap) {
  try {
    const targetData = targetSheet.getDataRange().getValues().slice(1);
    const targetMap = new Map(targetData.map((row, idx) => [row[9], idx + 2]));

    changes.forEach(change => {
      try {
        // Add more details to make a more unique ID
        const changeEventId = `${change.campaignId}-${change.type}-${change.date}`;
        const changeEventDate = new Date(change.date);
        const formattedDate = Utilities.formatDate(changeEventDate, 'GMT', 'MM/dd/yyyy HH:mm:ss');
        
        // Create a human-readable summary of the change
        const summary = createHumanReadableSummary(change);

        if (!ignoreMap.has(changeEventId)) {
          Logger.log(`Processing new change for ${change.campaignName} (ID: ${change.campaignId})`);
          
          // Calculate date ranges for performance data
          const beforeEndDate = changeEventDate.toISOString().split('T')[0];
          const beforeStartDate = new Date(changeEventDate);
          beforeStartDate.setDate(beforeStartDate.getDate() - CONFIG.DAYS_BEFORE);
          const beforeStartDateStr = beforeStartDate.toISOString().split('T')[0];
          
          Logger.log(`Fetching performance data from ${beforeStartDateStr} to ${beforeEndDate}`);
          
          // Get performance data at campaign level
          const beforePerf = getPerformanceData(
            change.campaignId, 
            null,
            beforeStartDateStr, 
            beforeEndDate
          );
          
          // Create more descriptive change type for display
          const displayChangeType = `${change.changeLevel} ${change.type}`;

          // Append to ignore sheet
          ignoreSheet.appendRow([tab, change.campaignId, changeEventId, formattedDate]);
          
          // Append to target sheet with all data
          targetSheet.appendRow([
            change.campaignName,
            change.campaignId,
            beforePerf.cpc,
            '',  // CPC After (to be filled later)
            beforePerf.ctr,
            '',  // CTR After (to be filled later)
            beforePerf.conversionRate,
            '',  // Conv Rate After (to be filled later)
            displayChangeType,
            changeEventId,
            formattedDate,
            summary,  // Use the human-readable summary here
            beforePerf.auctionInsights
          ]);
          
          ignoreMap.set(changeEventId, { 
            tab, 
            campaignId: change.campaignId, 
            date: changeEventDate 
          });
          
          Logger.log(`Successfully appended new ${tab} change for campaign: ${change.campaignName}, ID: ${changeEventId}, Summary: ${summary}`);
        } else {
          Logger.log(`Change already exists in ignore map: ${changeEventId}`);
        }
      } catch (e) {
        Logger.log(`Error processing change for campaign ${change.campaignName}: ${e.message}`);
      }
    });
  } catch (e) {
    Logger.log(`General error in processChanges: ${e.message}`);
  }
}

// Check 14-Day Updates with improved date handling
function checkFourteenDayUpdates(budgetSheet, audienceSheet, ignoreSheet, ignoreMap) {
  const budgetData = budgetSheet.getDataRange().getValues().slice(1);
  const budgetMap = new Map(budgetData.map((row, idx) => [row[9], idx + 2]));
  const audienceData = audienceSheet.getDataRange().getValues().slice(1);
  const audienceMap = new Map(audienceData.map((row, idx) => [row[9], idx + 2]));

  ignoreMap.forEach((entry, changeEventId) => {
    try {
      const daysSince = (new Date() - entry.date) / (1000 * 60 * 60 * 24);
      Logger.log(`Checking ${changeEventId}: ${daysSince.toFixed(1)} days since change`);
      
      if (daysSince >= 14) {
        const targetSheet = entry.tab === 'Budget' ? budgetSheet : audienceSheet;
        const targetMap = entry.tab === 'Budget' ? budgetMap : audienceMap;
        
        if (targetMap.has(changeEventId)) {
          const rowNum = targetMap.get(changeEventId);
          Logger.log(`Updating 14-day metrics for ${entry.tab} change in row ${rowNum}`);
          
          const changeDate = entry.date;
          const afterStartDate = new Date(changeDate);
          const afterEndDate = new Date(changeDate);
          afterEndDate.setDate(afterEndDate.getDate() + CONFIG.DAYS_BEFORE);
          
          // Fix: Create a new Date object to compare dates properly
          const currentDate = new Date();
          // Use Math.min with getTime() to compare date values correctly
          const endDateToUse = new Date(Math.min(afterEndDate.getTime(), currentDate.getTime()));
          
          const afterStartDateStr = afterStartDate.toISOString().split('T')[0];
          const endDateToUseStr = endDateToUse.toISOString().split('T')[0];
          
          Logger.log(`Fetching after-change performance: ${afterStartDateStr} to ${endDateToUseStr}`);
          
          const afterPerf = getPerformanceData(
            entry.campaignId, 
            null,
            afterStartDateStr,
            endDateToUseStr
          );
          
          // Log what we're updating
          Logger.log(`After metrics - CPC: ${afterPerf.cpc}, CTR: ${afterPerf.ctr}, Conv Rate: ${afterPerf.conversionRate}`);
          
          // Update the sheet with the after performance data
          targetSheet.getRange(rowNum, 4).setValue(afterPerf.cpc);
          targetSheet.getRange(rowNum, 6).setValue(afterPerf.ctr);
          targetSheet.getRange(rowNum, 8).setValue(afterPerf.conversionRate);
          
          Logger.log(`Successfully updated 14-day metrics for ${entry.tab} change: ${changeEventId}`);
        } else {
          Logger.log(`Change ID ${changeEventId} not found in ${entry.tab} sheet map`);
        }
      }
    } catch (e) {
      Logger.log(`Error in checkFourteenDayUpdates for ${changeEventId}: ${e.message}`);
    }
  });
}

// Function to add AI Insights to rows with complete before/after metrics
function addAIInsights() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const budgetSheet = ss.getSheetByName('Budget Monitoring');
    
    // Get all data from the sheet
    const data = budgetSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find the column indices for the metrics and AI Insights
    const cpcBeforeCol = headers.indexOf('CPC Before') + 1;
    const cpcAfterCol = headers.indexOf('CPC After') + 1;
    const ctrBeforeCol = headers.indexOf('CTR Before') + 1;
    const ctrAfterCol = headers.indexOf('CTR After') + 1;
    const convBeforeCol = headers.indexOf('Conversion Rate Before') + 1;
    const convAfterCol = headers.indexOf('Conversion Rate After') + 1;
    const aiInsightsCol = headers.indexOf('AI Insights') + 1;
    
    // If AI Insights column doesn't exist, add it
    if (aiInsightsCol === 0) {
      budgetSheet.getRange(1, headers.length + 1).setValue('AI Insights');
      Logger.log('Added AI Insights column to Budget Monitoring sheet');
    }
    
    // Counter for rows updated
    let updatedRows = 0;
    
    // Iterate through rows starting from row 2 (skipping header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Check if all "After" columns have values
      if (row[cpcAfterCol - 1] !== '' && 
          row[ctrAfterCol - 1] !== '' && 
          row[convAfterCol - 1] !== '') {
        
        // Create a range reference for the entire row from column A to column M
        const rowRange = `A${i+1}:M${i+1}`;
        
        // Apply the GPT formula to the AI Insights cell
        const formula = `=GPT("Analyze the data in this row 'Budget Monitoring' which rows that have both CPC, CTR and Conversion Rate Before and After. Give insights into how budget change (convert amountMicros to actual $ value in your text output by dividing it by 1000000) impact the progression of these metrics after a certain amount of time (14 days). Write insights on this cell. Make sure your insight is concise, yet informative and action-oriented",${rowRange},0,standard,false)`;
        
        // Only update the formula if the cell is empty or doesn't start with "=GPT"
        const currentInsight = budgetSheet.getRange(i+1, aiInsightsCol || headers.length + 1).getFormula();
        if (!currentInsight || !currentInsight.startsWith('=GPT')) {
          budgetSheet.getRange(i+1, aiInsightsCol || headers.length + 1).setFormula(formula);
          Logger.log(`Applied AI Insights formula to row ${i+1}`);
          updatedRows++;
        }
      }
    }
    
    // Display a summary of what was done
    if (updatedRows > 0) {
      SpreadsheetApp.getActiveSpreadsheet().toast(`Updated AI Insights for ${updatedRows} rows in the Budget Monitoring sheet.`, '✅ AI Insights Update', 10);
    } else {
      SpreadsheetApp.getActiveSpreadsheet().toast('No rows with complete before/after metrics found to update.', '🔍 AI Insights Update', 5);
    }
    
    Logger.log(`AI Insights update complete. Updated ${updatedRows} rows.`);
    
  } catch (e) {
    Logger.log(`Error in addAIInsights: ${e.message}`);
    SpreadsheetApp.getActiveSpreadsheet().toast(`Error: ${e.message}`, '❌ AI Insights Error', 10);
  }
}

// Utility Functions
function getDateDaysAgo(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result.toISOString().split('T')[0];
}

// Custom Menu for Manual Runs
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎛️ Console 🎛️')
    .addItem('🔐 Unlock Token', 'refreshAccessToken')
    .addItem('🔓 Fetch 24hrs', 'runMonitoring')
    .addItem('🧠 Update AI Insights', 'addAIInsights')
    .addToUi();
}
