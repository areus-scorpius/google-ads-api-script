function fetchGoogleAdsData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Google Ads Change Tracker");

  // Fetch OAuth token
  var accessToken = refreshAccessToken();
  if (!accessToken) {
    Logger.log("Failed to get Access Token. Check OAuth setup.");
    return;
  }

  var customerId = "abc"; // Replace with your customer ID
  var url = "https://googleads.googleapis.com/v15/customers/" + customerId + "/googleAds:search";

  var query = "SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, " +
    "campaign.bidding_strategy_type, campaign_budget.amount_micros, metrics.average_cpc, " +
    "metrics.ctr, metrics.conversions, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type " +
    "FROM campaign WHERE campaign.status='ENABLED' AND segments.date DURING LAST_30_DAYS";

  var options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + accessToken,
      "developer-token": "abc", // Replace with valid developer token
      "login-customer-id": customerId,
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify({ "query": query }),
    "muteHttpExceptions": true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    Logger.log("API Response: " + response.getContentText());

    var data = JSON.parse(response.getContentText());

    if (!data.results) {
      Logger.log("No campaigns found or API issue: " + response.getContentText());
      return;
    }

    var campaigns = data.results;
    var lastRow = sheet.getLastRow() + 1;

    campaigns.forEach(function (campaign) {
      var campaignName = campaign.campaign.name;
      var campaignId = campaign.campaign.id;
      var startDate = campaign.campaign.start_date;
      var bidStrategy = campaign.campaign.bidding_strategy_type;
      var budget = campaign.campaign_budget.amount_micros / 1e6; // Convert from micros
      var cpc = campaign.metrics.average_cpc / 1e6; // Convert from micros
      var ctr = campaign.metrics.ctr;
      var conversions = campaign.metrics.conversions;
      var keyword = campaign.ad_group_criterion.keyword.text;
      var matchType = campaign.ad_group_criterion.keyword.match_type;
      var changeSummary = "";
      var changeEventID = Utilities.getUuid();
      var changeDate = new Date();

      // Fetch previous data for comparison
      var lastRowData = sheet.getRange(lastRow - 1, 1, 1, 14).getValues();
      if (lastRowData.length > 0) {
        var prevBidStrategy = lastRowData[0][8];
        var prevBudget = lastRowData[0][9];
        var lastWeekCPC = lastRowData[0][2];
        var lastWeekCTR = lastRowData[0][4];

        // Scenario 1: Detect bid strategy or budget changes
        if (prevBidStrategy !== bidStrategy || prevBudget !== budget) {
          changeSummary = `Bid Strategy changed from ${prevBidStrategy} to ${bidStrategy}, Budget changed from ${prevBudget} to ${budget}`;
        }

        // Scenario 2: Detect keyword & match type changes if no bid changes
        if (!changeSummary && (keyword || matchType !== "EXACT")) {
          changeSummary = `Keyword changes detected: ${keyword} with ${matchType} match.`;
        }

        // Scenario 3: Detect CPC & CTR fluctuations
        if (!changeSummary && (cpc > lastWeekCPC * 1.5 || cpc < lastWeekCPC * 0.5)) {
          changeSummary = `CPC changed significantly from ${lastWeekCPC} to ${cpc}`;
        }
        if (!changeSummary && (ctr > lastWeekCTR * 1.5 || ctr < lastWeekCTR * 0.5)) {
          changeSummary = `CTR changed significantly from ${lastWeekCTR} to ${ctr}`;
        }
      }

      // Insert data into Google Sheet
      sheet.appendRow([
        campaignName, campaignId, lastWeekCPC, cpc, lastWeekCTR, ctr,
        "", conversions, changeSummary, changeEventID, changeDate, "", "", ""
      ]);
    });

    // Fetch auction insights if CPC or CTR changed significantly
    fetchAuctionInsights();
  } catch (e) {
    Logger.log("Error: " + e.toString());
  }
}

// Function to fetch auction insights if drastic CPC/CTR changes occur
function fetchAuctionInsights() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Google Ads Change Tracker");
  var accessToken = refreshAccessToken();
  if (!accessToken) {
    Logger.log("Failed to get Access Token. Check OAuth setup.");
    return;
  }

  var customerId = "abc"; // Replace with valid customer ID
  var url = "https://googleads.googleapis.com/v15/customers/" + customerId + "/googleAds:search";

  var query = "SELECT auction_insight.domain, auction_insight.impression_share, auction_insight.average_position " +
    "FROM campaign WHERE campaign.status='ENABLED'";

  var options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + accessToken,
      "developer-token": "abc",
      "login-customer-id": customerId,
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify({ "query": query }),
    "muteHttpExceptions": true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());

    if (!data.results) {
      Logger.log("No auction insights found.");
      return;
    }

    var auctionInsights = data.results;
    auctionInsights.forEach(function (auction, index) {
      sheet.getRange(index + 2, 13).setValue(`Domain: ${auction.auction_insight.domain}, 
        Impression Share: ${auction.auction_insight.impression_share}, 
        Avg Position: ${auction.auction_insight.average_position}`);
    });
  } catch (e) {
    Logger.log("Error fetching auction insights: " + e.toString());
  }
}

// Refresh OAuth token
function refreshAccessToken() {
  var clientId = "abc"; // Replace with Google Cloud Console client ID
  var clientSecret = "abc";
  var refreshToken = "abc"; // Replace with valid refresh token

  var url = "https://oauth2.googleapis.com/token";
  var payload = {
    "client_id": clientId,
    "client_secret": clientSecret,
    "refresh_token": refreshToken,
    "grant_type": "refresh_token"
  };

  var options = {
    "method": "post",
    "contentType": "application/x-www-form-urlencoded",
    "payload": payload,
    "muteHttpExceptions": true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());

    if (data.error) {
      Logger.log("OAuth Error: " + JSON.stringify(data));
      return null;
    }

    Logger.log("New Access Token: " + data.access_token);
    return data.access_token;
  } catch (e) {
    Logger.log("OAuth Exception: " + e.toString());
    return null;
  }
}
