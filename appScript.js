function fetchGoogleAdsData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Google Ads Tracker");

  // Fetch OAuth token
  var accessToken = refreshAccessToken();

  var customerId = "abc";  // Remove dashes
  var url = "https://googleads.googleapis.com/v15/customers/" + customerId + "/googleAds:search"; // Updated to v15

  var query = "SELECT campaign.id, campaign.name, campaign.status, campaign.start_date, campaign.bidding_strategy_type, metrics.average_cpc, metrics.ctr, metrics.conversions FROM campaign WHERE campaign.status='ENABLED' AND segments.date DURING LAST_30_DAYS";

  var options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + accessToken,
      "developer-token": "abc", // Check if it's approved
      "login-customer-id": customerId, // Required for MCC accounts
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify({ "query": query }),
    "muteHttpExceptions": true // Helps in debugging the full error response
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
    sheet.getRange("A2:H").clearContent();  // Clear old data
    campaigns.forEach(function (campaign, index) {
      sheet.getRange(index + 2, 1).setValue(campaign.campaign.name);
      sheet.getRange(index + 2, 2).setValue(campaign.campaign.id);
      sheet.getRange(index + 2, 3).setValue(campaign.campaign.start_date);
      sheet.getRange(index + 2, 4).setValue(campaign.campaign.bidding_strategy_type);
      sheet.getRange(index + 2, 5).setValue(campaign.metrics.average_cpc);
      sheet.getRange(index + 2, 6).setValue(campaign.metrics.ctr);
      sheet.getRange(index + 2, 7).setValue(campaign.metrics.conversions);
      sheet.getRange(index + 2, 8).setValue(campaign.campaign.status);
    });

    sheet.getRange("J1").setValue("Last Updated: " + new Date());
  } catch (e) {
    Logger.log("Error: " + e.toString());
  }
}

function refreshAccessToken() {
  var clientId = "abc";  // Replace with Google Cloud Console client ID
  var clientSecret = "abc";
  var refreshToken = "abc";  // Get from OAuth Playground

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
    "payload": payload
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());

    Logger.log("New Access Token: " + data.access_token);
    return data.access_token;
  } catch (e) {
    Logger.log("OAuth Error: " + e.toString());
  }
}
