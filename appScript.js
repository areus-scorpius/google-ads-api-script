function trackGoogleAdsChanges() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Google Ads Change Tracker");
  var apiKey = "YOUR_GOOGLE_ADS_API_KEY";  // Replace with your API Key
  var customerId = "YOUR_CUSTOMER_ID";  // Replace with your Google Ads Account ID

  // Get Google Ads Data for Key Changes (Scenario 1)
  var url = `https://googleads.googleapis.com/v11/customers/${customerId}/googleAds:search?query=
  SELECT campaign.id, campaign.name, campaign.start_date, campaign.bidding_strategy_type, 
  campaign_budget.amount_micros, campaign_budget.id, ad_group_criterion.criterion_id, 
  ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, 
  ad_group_criterion.status, metrics.average_cpc, metrics.ctr, metrics.conversions 
  FROM campaign WHERE campaign.status='ENABLED'`;

  var options = {
    "method": "get",
    "headers": {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    }
  };

  var response = UrlFetchApp.fetch(url, options);
  var data = JSON.parse(response.getContentText());

  var campaigns = data.results;
  var lastRow = sheet.getLastRow() + 1;

  campaigns.forEach(function(campaign) {
    var campaignName = campaign.campaign.name;
    var campaignId = campaign.campaign.id;
    var cpc = campaign.metrics.average_cpc / 1e6; // Convert from micros to actual value
    var ctr = campaign.metrics.ctr;
    var conversions = campaign.metrics.conversions;
    var bidStrategy = campaign.campaign.bidding_strategy_type;
    var budget = campaign.campaign_budget.amount_micros / 1e6; // Convert from micros
    var changeSummary = "";
    var changeEventID = Utilities.getUuid();
    var changeDate = new Date();

    // Check for bid strategy & budget changes (Scenario 1)
    var lastRowData = sheet.getRange(lastRow - 1, 1, 1, 14).getValues();
    if (lastRowData.length > 0) {
      var prevBidStrategy = lastRowData[0][8];
      var prevBudget = lastRowData[0][9];

      if (prevBidStrategy !== bidStrategy || prevBudget !== budget) {
        changeSummary = `Bid Strategy changed from ${prevBidStrategy} to ${bidStrategy}, Budget changed from ${prevBudget} to ${budget}`;
      }
    }

    // Check for keyword and audience changes (Scenario 2)
    var keywords = campaign.ad_group_criterion.keyword.text;
    var matchType = campaign.ad_group_criterion.keyword.match_type;
    var status = campaign.ad_group_criterion.status;
    if (!changeSummary && (keywords || matchType !== "EXACT" || status !== "ENABLED")) {
      changeSummary = `Keyword changes detected: ${keywords} with ${matchType} match.`;
    }

    // Check for CPC and CTR sudden changes (Scenario 3)
    var lastWeekCPC = lastRowData[0][2];
    var lastWeekCTR = lastRowData[0][4];
    if (!changeSummary && (cpc > lastWeekCPC * 1.5 || cpc < lastWeekCPC * 0.5)) {
      changeSummary = `CPC changed significantly from ${lastWeekCPC} to ${cpc}`;
    }
    if (!changeSummary && (ctr > lastWeekCTR * 1.5 || ctr < lastWeekCTR * 0.5)) {
      changeSummary = `CTR changed significantly from ${lastWeekCTR} to ${ctr}`;
    }

    // Insert data into the sheet
    sheet.appendRow([
      campaignName, campaignId, lastWeekCPC, cpc, lastWeekCTR, ctr, 
      lastRowData[0][6], conversions, changeSummary, changeEventID, changeDate, "", "", ""
    ]);
  });

  // Fetch auction insights if CPC or CTR changed significantly
  fetchAuctionInsights();
}

function fetchAuctionInsights() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Google Ads Change Tracker");
  var apiKey = "YOUR_GOOGLE_ADS_API_KEY";  
  var customerId = "YOUR_CUSTOMER_ID";  

  var url = `https://googleads.googleapis.com/v11/customers/${customerId}/googleAds:search?query=
  SELECT auction_insight.domain, auction_insight.impression_share, auction_insight.average_position 
  FROM campaign WHERE campaign.status='ENABLED'`;

  var options = {
    "method": "get",
    "headers": {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    }
  };

  var response = UrlFetchApp.fetch(url, options);
  var data = JSON.parse(response.getContentText());

  var auctionInsights = data.results;
  auctionInsights.forEach(function(auction, index) {
    sheet.getRange(index + 2, 13).setValue(`Domain: ${auction.auction_insight.domain}, 
      Impression Share: ${auction.auction_insight.impression_share}, 
      Avg Position: ${auction.auction_insight.average_position}`);
  });
}
