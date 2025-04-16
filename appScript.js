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

// Main Function - Consolidated to handle all change types in one sheet
function runMonitoring() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const budgetSheet = ss.getSheetByName('Budget Monitoring');
  const ignoreSheet = ss.getSheetByName('campaignIgnore');
  
  // Add a column for Cut-off Insights if it doesn't exist
  ensureCutoffInsightsColumn(budgetSheet);
  
  const ignoreData = ignoreSheet.getDataRange().getValues().slice(1); // Skip header
  const ignoreMap = new Map(ignoreData.map(row => [
    row[2], // Change Events ID
    { tab: row[0], campaignId: row[1], date: new Date(row[3]) }
  ]));

  // Check bid and budget changes
  Logger.log("Checking bid and budget changes...");
  const bidBudgetChanges = checkBidBudgetChanges();
  if (bidBudgetChanges.length > 0) {
    Logger.log(`Found ${bidBudgetChanges.length} bid/budget changes`);
    processChanges(budgetSheet, ignoreSheet, bidBudgetChanges, 'Budget', ignoreMap);
  } else {
    Logger.log("No bid/budget changes found");
  }
  
  // Check keyword and audience changes - now also going to Budget sheet
  Logger.log("Checking keyword and audience changes...");
  const kwAudienceChanges = checkKeywordAudienceChanges();
  if (kwAudienceChanges.length > 0) {
    Logger.log(`Found ${kwAudienceChanges.length} keyword/audience changes`);
    processChanges(budgetSheet, ignoreSheet, kwAudienceChanges, 'Audience', ignoreMap);
  } else {
    Logger.log("No keyword/audience changes found");
  }

  // Check for both 14-day updates and cut-off events from other changes
  checkCutoffAndFourteenDayUpdates(budgetSheet, ignoreSheet, ignoreMap);
  
  // Fix empty values in metrics columns
  fixEmptyMetricsValues(budgetSheet);
  
  // Reformat change event summaries
  reformatChangeSummaries(budgetSheet);
}

// Function to ensure Cut-off Insights column exists
function ensureCutoffInsightsColumn(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const aiInsightsIndex = headers.indexOf('AI Insights');
  
  // If 'AI Insights' exists, rename it to 'Cut-off Insights'
  if (aiInsightsIndex !== -1) {
    sheet.getRange(1, aiInsightsIndex + 1).setValue('Cut-off Insights');
    Logger.log('Renamed "AI Insights" column to "Cut-off Insights"');
  } 
  // If neither exists, add 'Cut-off Insights' column
  else if (headers.indexOf('Cut-off Insights') === -1) {
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1).setValue('Cut-off Insights');
    Logger.log('Added "Cut-off Insights" column');
  }
}

// Function to fix empty metrics values
function fixEmptyMetricsValues(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // Only header row or empty sheet
  
  const headers = data[0];
  const cpcBeforeCol = headers.indexOf('CPC Before') + 1;
  const ctrBeforeCol = headers.indexOf('CTR Before') + 1;
  const convBeforeCol = headers.indexOf('Conversion Rate Before') + 1;
  
  // Only proceed if we found these columns
  if (cpcBeforeCol === 0 || ctrBeforeCol === 0 || convBeforeCol === 0) return;
  
  let updatesNeeded = false;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let rowNeedsUpdate = false;
    
    // Check if CPC Before is empty
    if (row[cpcBeforeCol - 1] === '' || row[cpcBeforeCol - 1] === 0) {
      sheet.getRange(i + 1, cpcBeforeCol).setValue(0);
      rowNeedsUpdate = true;
    }
    
    // Check if CTR Before is empty
    if (row[ctrBeforeCol - 1] === '' || row[ctrBeforeCol - 1] === 0) {
      sheet.getRange(i + 1, ctrBeforeCol).setValue(0);
      rowNeedsUpdate = true;
    }
    
    // Check if Conversion Rate Before is empty
    if (row[convBeforeCol - 1] === '' || row[convBeforeCol - 1] === 0) {
      sheet.getRange(i + 1, convBeforeCol).setValue(0);
      rowNeedsUpdate = true;
    }
    
    if (rowNeedsUpdate) updatesNeeded = true;
  }
  
  if (updatesNeeded) {
    Logger.log(`Fixed empty metrics values in sheet: ${sheet.getName()}`);
  }
}

// Function to reformat change event summaries
function reformatChangeSummaries(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // Only header row or empty sheet
  
  const headers = data[0];
  const changeEventSummaryCol = headers.indexOf('Change Event Summary') + 1;
  const changeTypeCol = headers.indexOf('Changes Events') + 1;
  
  // Only proceed if we found these columns
  if (changeEventSummaryCol === 0) return;
  
  let updatesNeeded = false;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const summary = row[changeEventSummaryCol - 1];
    const changeType = row[changeTypeCol - 1];
    
    if (summary) {
      try {
        // Extract the change level (Campaign or Ad Group)
        const changeLevel = changeType ? changeType.split(' ')[0].replace(/[\[\]]/g, '') : "Campaign";
        let newSummary = summary;
        
        // Handle budget changes
        if (summary.includes('campaignBudget') && summary.includes('amountMicros')) {
          newSummary = createFormattedBudgetSummary(summary, changeLevel);
          updatesNeeded = true;
        } 
        // Handle bidding strategy changes
        else if (summary.includes('bidding_strategy') || 
                summary.includes('targetCpa') || 
                summary.includes('targetRoas') || 
                summary.includes('manualCpc') ||
                summary.includes('maximizeConversions')) {
          
          // Try to extract old and new values to format as bidding strategy change
          try {
            const oldValueStr = summary.substring(summary.indexOf('Old=') + 4, summary.indexOf(', New='));
            const newValueStr = summary.substring(summary.indexOf('New=') + 5);
            
            // Create a properly formatted bidding strategy summary
            newSummary = formatBiddingStrategyChange(oldValueStr, newValueStr, changeLevel, row[0]);
            updatesNeeded = true;
          } catch (err) {
            Logger.log(`Error formatting bidding strategy change in row ${i + 1}: ${err.message}`);
          }
        }
        
        // Update the summary cell if it changed
        if (newSummary !== summary) {
          sheet.getRange(i + 1, changeEventSummaryCol).setValue(newSummary);
        }
      } catch (e) {
        Logger.log(`Error reformatting summary in row ${i + 1}: ${e.message}`);
      }
    }
  }
  
  if (updatesNeeded) {
    Logger.log(`Reformatted change event summaries in sheet: ${sheet.getName()}`);
  }
}

// Helper function to create a formatted budget summary
function createFormattedBudgetSummary(originalSummary, changeLevel) {
  try {
    // Extract old and new values using regex
    const oldValueMatch = originalSummary.match(/Old=.*?"amountMicros":"(\d+)"/);
    const newValueMatch = originalSummary.match(/New=.*?"amountMicros":"(\d+)"/);
    
    if (!oldValueMatch || !newValueMatch) {
      return originalSummary; // Unable to extract values, keep original
    }
    
    // Convert amountMicros to dollars
    const oldAmountMicros = parseInt(oldValueMatch[1], 10);
    const newAmountMicros = parseInt(newValueMatch[1], 10);
    
    const oldDollars = oldAmountMicros / 1000000;
    const newDollars = newAmountMicros / 1000000;
    
    // Determine if it's an increase or decrease
    const action = newDollars > oldDollars ? "Increased" : "Decreased";
    
    // Format with dollar sign and 2 decimal places
    const oldFormatted = `$${oldDollars.toFixed(2)}`;
    const newFormatted = `$${newDollars.toFixed(2)}`;
    
    // Create the formatted summary
    return `${action} ${changeLevel} daily budget from ${oldFormatted} to ${newFormatted}`;
  } catch (e) {
    Logger.log(`Error in createFormattedBudgetSummary: ${e.message}`);
    return originalSummary; // Return original on error
  }
}

// Helper function to format bidding strategy changes
function formatBiddingStrategyChange(oldValueStr, newValueStr, changeLevel, campaignName) {
  try {
    const oldValue = typeof oldValueStr === 'string' ? JSON.parse(oldValueStr) : oldValueStr;
    const newValue = typeof newValueStr === 'string' ? JSON.parse(newValueStr) : newValueStr;
    
    // Extract campaign objects
    const oldCampaign = oldValue.campaign || {};
    const newCampaign = newValue.campaign || {};
    
    // Determine old and new bidding strategy types
    let oldStrategyType = extractBiddingStrategyType(oldCampaign);
    let newStrategyType = extractBiddingStrategyType(newCampaign);
    
    // Extract bid values if applicable
    let oldBidValue = extractBidValue(oldCampaign, oldStrategyType);
    let newBidValue = extractBidValue(newCampaign, newStrategyType);
    
    // Create a human-readable description
    let summary = `Changed bidding strategy at ${changeLevel} level`;
    if (campaignName) {
      summary += ` for "${campaignName}"`;
    }
    
    if (oldStrategyType !== newStrategyType) {
      summary += ` from ${formatStrategyName(oldStrategyType)} to ${formatStrategyName(newStrategyType)}`;
    }
    
    // Add bid value changes if we have them
    if (oldBidValue !== null && newBidValue !== null && typeof oldBidValue === 'number' && typeof newBidValue === 'number') {
      if (oldStrategyType === newStrategyType) {
        const action = newBidValue > oldBidValue ? 'Increased' : 'Decreased';
        summary = `${action} ${formatStrategyName(newStrategyType)} bid`;
        summary += ` at ${changeLevel} level`;
        if (campaignName) {
          summary += ` for "${campaignName}"`;
        }
      }
      
      // Format the values based on strategy type
      if (oldStrategyType === 'TARGET_ROAS' || newStrategyType === 'TARGET_ROAS') {
        summary += ` from ${(oldBidValue * 100).toFixed(2)}% to ${(newBidValue * 100).toFixed(2)}%`;
      } else {
        summary += ` from $${oldBidValue.toFixed(2)} to $${newBidValue.toFixed(2)}`;
      }
    }
    
    return summary;
  } catch (e) {
    Logger.log(`Error formatting bidding strategy change: ${e.message}`);
    return `Bidding strategy change (Error formatting details)`;
  }
}

// Helper function to extract bidding strategy type from campaign object
function extractBiddingStrategyType(campaignObj) {
  if (!campaignObj) return 'UNKNOWN';
  
  if (campaignObj.biddingStrategyType) return campaignObj.biddingStrategyType;
  if (campaignObj.manualCpc) return 'MANUAL_CPC';
  if (campaignObj.manualCpm) return 'MANUAL_CPM';
  if (campaignObj.targetCpa) return 'TARGET_CPA';
  if (campaignObj.targetRoas) return 'TARGET_ROAS';
  if (campaignObj.maximizeConversions) return 'MAXIMIZE_CONVERSIONS';
  if (campaignObj.maximizeConversionValue) return 'MAXIMIZE_CONVERSION_VALUE';
  
  return 'UNKNOWN';
}

// Helper function to extract bid value from campaign based on strategy type
function extractBidValue(campaignObj, strategyType) {
  if (!campaignObj) return null;
  
  switch(strategyType) {
    case 'MANUAL_CPC':
      // For manual CPC, return enhanced status as string or null
      if (campaignObj.manualCpc && campaignObj.manualCpc.enhancedCpcEnabled !== undefined) {
        return campaignObj.manualCpc.enhancedCpcEnabled ? 'Enhanced CPC' : 'Manual CPC';
      }
      return null;
    case 'TARGET_CPA':
      return campaignObj.targetCpa && campaignObj.targetCpa.targetCpaMicros
        ? parseFloat(campaignObj.targetCpa.targetCpaMicros) / 1000000
        : null;
    case 'TARGET_ROAS':
      return campaignObj.targetRoas && campaignObj.targetRoas.targetRoas
        ? parseFloat(campaignObj.targetRoas.targetRoas)
        : null;
    case 'MAXIMIZE_CONVERSIONS':
      return campaignObj.maximizeConversions && campaignObj.maximizeConversions.targetCpaMicros
        ? parseFloat(campaignObj.maximizeConversions.targetCpaMicros) / 1000000
        : null;
    case 'MAXIMIZE_CONVERSION_VALUE':
      return campaignObj.maximizeConversionValue && campaignObj.maximizeConversionValue.targetRoas
        ? parseFloat(campaignObj.maximizeConversionValue.targetRoas)
        : null;
    default:
      return null;
  }
}

// Helper function to format bidding strategy type to human-readable name
function formatStrategyName(strategyType) {
  switch(strategyType) {
    case 'MANUAL_CPC': return 'Manual CPC';
    case 'ENHANCED_CPC': return 'Enhanced CPC';
    case 'TARGET_CPA': return 'Target CPA';
    case 'TARGET_ROAS': return 'Target ROAS';
    case 'MAXIMIZE_CONVERSIONS': return 'Maximize Conversions';
    case 'MAXIMIZE_CONVERSION_VALUE': return 'Maximize Conversion Value';
    case 'UNKNOWN': return 'Unknown';
    default: return strategyType.replace(/_/g, ' ').toLowerCase()
      .replace(/\b\w/g, l => l.toUpperCase()); // Title case
  }
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

// Function to check bid and budget changes
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
        'CAMPAIGN_CRITERION'
      )
    LIMIT 10000
  `;
  
  // Enhanced list of fields to monitor for bid/budget related changes
  return processChangeEvents(query, [
    'CAMPAIGN_BUDGET', 
    'AD_GROUP_BID_MODIFIER', 
    'AD_GROUP_CRITERION', 
    'CAMPAIGN',
    'CAMPAIGN_CRITERION'
  ], [
    'bidding_strategy_type', 
    'bidding_strategy', 
    'maximize_conversion_value', 
    'maximize_conversions',
    'budget',
    'target_cpa',
    'target_roas',
    'cpc_bid',
    'cpv_bid',
    'cpm_bid',
    'target_spend',
    'bid_modifier',
    'manual_cpc',
    'manual_cpm',
    'enhanced_cpc'
  ]);
}

// Function to check keyword and audience changes
function checkKeywordAudienceChanges() {
  const now = new Date();
  const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startDatetime = Utilities.formatDate(past, 'America/Los_Angeles', "yyyy-MM-dd HH:mm:ss");
  const endDatetime = Utilities.formatDate(now, 'America/Los_Angeles', "yyyy-MM-dd HH:mm:ss");
  
  Logger.log('Audience check - startDatetime: ' + startDatetime);
  Logger.log('Audience check - endDatetime: ' + endDatetime);
  
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
      'CAMPAIGN'
    )
    LIMIT 10000
  `;
  
  // List of relevant fields for audiences and keywords
  return processChangeEvents(query, [
    'AD_GROUP_CRITERION', 
    'CAMPAIGN_CRITERION', 
    'CAMPAIGN'
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

// Function to process change events 
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
                
                // Determine the level at which the change occurred
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

// Function to get performance data
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
    return {
      cpc: 0,
      ctr: 0,
      conversionRate: 0,
      auctionInsights: `Error: ${e.message}`,
      impressions: 0
    };
  }
}

// Function to process and append changes
function processChanges(targetSheet, ignoreSheet, changes, changeType, ignoreMap) {
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
          
          // Get performance data at campaign level
          const beforePerf = getPerformanceData(
            change.campaignId, 
            null,
            beforeStartDateStr, 
            beforeEndDate
          );
          
          // Create more descriptive change type for display with category prefix
          const displayChangeType = `[${changeType.toUpperCase()}] ${change.changeLevel} ${change.type}`;

          // Make sure metrics have default values if they're zero or empty
          const cpcBefore = beforePerf.cpc || 0;
          const ctrBefore = beforePerf.ctr || 0;
          const convBefore = beforePerf.conversionRate || 0;
          
          // Append to ignore sheet - include change type for better tracking
          ignoreSheet.appendRow([changeType, change.campaignId, changeEventId, formattedDate]);
          
          // Append to target sheet with all data
          targetSheet.appendRow([
            change.campaignName,
            change.campaignId,
            cpcBefore,
            '',  // CPC After (to be filled later)
            ctrBefore,
            '',  // CTR After (to be filled later)
            convBefore,
            '',  // Conv Rate After (to be filled later)
            displayChangeType,
            changeEventId,
            formattedDate,
            summary,
            beforePerf.auctionInsights
          ]);
          
          ignoreMap.set(changeEventId, { 
            tab: changeType, 
            campaignId: change.campaignId, 
            date: changeEventDate 
          });
          
          Logger.log(`Successfully appended new ${changeType} change for campaign: ${change.campaignName}`);
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

// Enhanced check for both 14-day updates and cut-off events
function checkCutoffAndFourteenDayUpdates(budgetSheet, ignoreSheet, ignoreMap) {
  // Get the data from the Budget Sheet
  const budgetData = budgetSheet.getDataRange().getValues();
  if (budgetData.length <= 1) return; // Only header row
  
  const headers = budgetData[0];
  const campaignIdCol = headers.indexOf('Campaign ID') + 1;
  const changeEventIdCol = headers.indexOf('Change Events ID') + 1;
  const cpcBeforeCol = headers.indexOf('CPC Before') + 1;
  const cpcAfterCol = headers.indexOf('CPC After') + 1;
  const ctrBeforeCol = headers.indexOf('CTR Before') + 1;
  const ctrAfterCol = headers.indexOf('CTR After') + 1;
  const convBeforeCol = headers.indexOf('Conversion Rate Before') + 1;
  const convAfterCol = headers.indexOf('Conversion Rate After') + 1;
  const cutoffInsightsCol = headers.indexOf('Cut-off Insights') + 1;
  
  // Build a mapping of campaigns to their change events
  const campaignChangeEvents = new Map();
  
  // First pass - collect all campaigns and their change events with dates
  for (let i = 1; i < budgetData.length; i++) {
    const row = budgetData[i];
    const campaignId = row[campaignIdCol - 1];
    const changeEventId = row[changeEventIdCol - 1];
    
    if (!campaignId || !changeEventId) continue;
    
    // Get the entry from the ignoreMap to get the actual date
    const entry = ignoreMap.get(changeEventId);
    if (!entry) continue;
    
    const changeDate = entry.date;
    
    // Add to the campaign change events map
    if (!campaignChangeEvents.has(campaignId)) {
      campaignChangeEvents.set(campaignId, []);
    }
    
    campaignChangeEvents.get(campaignId).push({
      changeEventId,
      date: changeDate,
      rowIndex: i + 1, // +1 because we're 0-indexed but sheets are 1-indexed
      hasCutoffInsights: !!row[cutoffInsightsCol - 1] // Check if it already has insights
    });
  }
  
  // Process each campaign's change events
  const now = new Date();
  campaignChangeEvents.forEach((events, campaignId) => {
    // Sort events by date (oldest first)
    events.sort((a, b) => a.date - b.date);
    
    // Check each event
    for (let i = 0; i < events.length; i++) {
      const currentEvent = events[i];
      
      // Skip if already has insights
      if (currentEvent.hasCutoffInsights) continue;
      
      // Look for the next event for this campaign
      const nextEvent = i < events.length - 1 ? events[i + 1] : null;
      
      // Check if this event is eligible for cutoff or 14-day insights
      const daysSince = (now - currentEvent.date) / (1000 * 60 * 60 * 24);
      const cutoffDate = nextEvent ? nextEvent.date : new Date(currentEvent.date.getTime() + 14 * 24 * 60 * 60 * 1000);
      const daysBetweenEvents = nextEvent ? (nextEvent.date - currentEvent.date) / (1000 * 60 * 60 * 1000 * 24) : 14;
      
      // Only process if either:
      // 1. 14 days have passed without another change or 
      // 2. There is a next event and it's been at least 1 day since the current event
      if ((daysSince >= 14 && !nextEvent) || (nextEvent && daysBetweenEvents >= 1)) {
        Logger.log(`Processing insights for campaign ${campaignId}, event at row ${currentEvent.rowIndex}`);
        
        // Calculate date ranges for performance data after the change
        const afterStartDate = new Date(currentEvent.date);
        const afterEndDate = new Date(Math.min(cutoffDate, now));
        
        const afterStartDateStr = afterStartDate.toISOString().split('T')[0];
        const afterEndDateStr = afterEndDate.toISOString().split('T')[0];
        
        // Get performance data
        const afterPerf = getPerformanceData(
          campaignId, 
          null,
          afterStartDateStr,
          afterEndDateStr
        );
        
        // Make sure to set 0 instead of empty values
        const cpcAfter = afterPerf.cpc || 0;
        const ctrAfter = afterPerf.ctr || 0;
        const convAfter = afterPerf.conversionRate || 0;
        
        // Get the current row data
        const rowData = budgetData[currentEvent.rowIndex - 1];
        const campaignName = rowData[0]; // Assuming Campaign Name is in column A
        
        // Get the before metrics
        const cpcBefore = rowData[cpcBeforeCol - 1] || 0;
        const ctrBefore = rowData[ctrBeforeCol - 1] || 0;
        const convBefore = rowData[convBeforeCol - 1] || 0;
        
        // Update the after metrics in the spreadsheet
        budgetSheet.getRange(currentEvent.rowIndex, cpcAfterCol).setValue(cpcAfter);
        budgetSheet.getRange(currentEvent.rowIndex, ctrAfterCol).setValue(ctrAfter);
        budgetSheet.getRange(currentEvent.rowIndex, convAfterCol).setValue(convAfter);
        
        // Calculate percentage changes for metrics
        const cpcChange = calculatePercentChange(cpcBefore, cpcAfter);
        const ctrChange = calculatePercentChange(ctrBefore, ctrAfter);
        const convChange = calculatePercentChange(convBefore, convAfter);
        
        // Generate the cut-off insights text
        let cutoffInsightsText = '';
        
        if (nextEvent) {
          // If cut off by another change event
          cutoffInsightsText = `During ${daysBetweenEvents.toFixed(1)} days, "${campaignName}" has seen ${formatMetricChanges(cpcChange, ctrChange, convChange)}. Cut-off by newer change event.`;
        } else {
          // If completed the 14-day cycle
          cutoffInsightsText = `During 14 days, "${campaignName}" has seen ${formatMetricChanges(cpcChange, ctrChange, convChange)}.`;
        }
        
        // Update the cut-off insights column
        budgetSheet.getRange(currentEvent.rowIndex, cutoffInsightsCol).setValue(cutoffInsightsText);
        
        Logger.log(`Updated cut-off insights at row ${currentEvent.rowIndex}`);
      }
    }
  });
}

// Helper function to calculate percentage change
function calculatePercentChange(before, after) {
  if (before === 0) return after > 0 ? 100 : 0;
  return ((after - before) / before) * 100;
}

// Helper function to format metric changes
function formatMetricChanges(cpcChange, ctrChange, convChange) {
  const parts = [];
  
  if (cpcChange !== 0) {
    parts.push(`${cpcChange > 0 ? 'an increase' : 'a decrease'} of ${Math.abs(cpcChange).toFixed(2)}% in CPC`);
  }
  
  if (ctrChange !== 0) {
    parts.push(`${ctrChange > 0 ? 'an increase' : 'a decrease'} of ${Math.abs(ctrChange).toFixed(2)}% in CTR`);
  }
  
  if (convChange !== 0) {
    parts.push(`${convChange > 0 ? 'an increase' : 'a decrease'} of ${Math.abs(convChange).toFixed(2)}% in Conversion Rate`);
  }
  
  if (parts.length === 0) {
    return "no significant changes in metrics";
  } else if (parts.length === 1) {
    return parts[0];
  } else if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  } else {
    return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  }
}

// Function to manually update cut-off insights
function updateCutoffInsights() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const budgetSheet = ss.getSheetByName('Budget Monitoring');
  const ignoreSheet = ss.getSheetByName('campaignIgnore');
  
  const ignoreData = ignoreSheet.getDataRange().getValues().slice(1); // Skip header
  const ignoreMap = new Map(ignoreData.map(row => [
    row[2], // Change Events ID
    { tab: row[0], campaignId: row[1], date: new Date(row[3]) }
  ]));
  
  checkCutoffAndFourteenDayUpdates(budgetSheet, ignoreSheet, ignoreMap);
  
  SpreadsheetApp.getActiveSpreadsheet().toast('Cut-off insights updated successfully.', '✅ Update Complete', 10);
}

// Custom Menu for Manual Runs
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎛️ Console 🎛️')
    .addItem('🔐 Unlock Token', 'refreshAccessToken')
    .addItem('🔓 Fetch 24hrs', 'runMonitoring')
    .addItem('📊 Update Cut-off Insights', 'updateCutoffInsights')
    .addItem('🧪 Test 90-Day Changes', 'testPast90DaysChanges')
    .addToUi();
}
