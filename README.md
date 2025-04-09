# Google Ads Change Monitoring Tool

A Google Apps Script tool for monitoring changes in Google Ads accounts and analyzing their impact on performance metrics over time.

## Overview

This script automatically detects changes made to your Google Ads campaigns (bidding strategies, budgets, keywords, audiences, etc.), records performance metrics before the change, and then compares them with metrics after the change to provide objective analysis of impact.

## Features

- **Automated Change Detection**: Detects changes to bidding strategies, budgets, keywords, audiences, and geographic targeting
- **Performance Tracking**: Records CPC, CTR, and conversion rate before and after changes
- **AI-Powered Analysis**: Automatically generates insights about the impact of changes
- **Comprehensive Logging**: Maintains detailed records of all changes and their effects
- **Low Maintenance**: Runs automatically on a daily schedule

## Prerequisites

- Google Ads account with API access
- Google Cloud Platform project with Google Ads API enabled
- Google Ads API Developer Token
- OAuth 2.0 credentials (Client ID and Client Secret)
- Google Sheet to store the monitoring data

## Setup Instructions

### 1. Create Google Sheet

Create a Google Sheet with the following worksheets:
- **Budget Monitoring**: Tracks bid and budget changes
- **Audience Monitoring**: Tracks keyword and audience changes
- **campaignIgnore**: Manages change tracking records

Each monitoring sheet should have these columns:
```
Campaign Name | Campaign ID | CPC Before | CPC After | CTR Before | CTR After | Conversion Rate Before | Conversion Rate After | Changes Events | Change Events ID | Change Event Date | Change Event Summary | Auction Insights
```

The campaignIgnore sheet should have these columns:
```
Tab | Campaign ID | Change Events ID | Change Event Date
```

### 2. Set Up OAuth and API Access

1. Create a GCP project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Google Ads API
3. Set up OAuth 2.0 credentials (Client ID and Client Secret)
4. Generate a refresh token for your Google Ads account
5. Obtain a Developer Token from your Google Ads manager account

### 3. Deploy the Script

1. Open your Google Sheet
2. Go to Extensions → Apps Script
3. Copy and paste the entire script into the Apps Script editor
4. Update the CONFIG object with your credentials:

```javascript
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
```

### 4. Set Up a Trigger

1. In the Apps Script editor, click on Triggers in the left sidebar
2. Click "+ Add Trigger"
3. Configure a daily trigger to run the `runMonitoring` function

## Using the Tool

The script will run automatically according to your trigger settings. You can also use the custom menu to run functions manually:

1. **🔐 Unlock Token**: Refreshes the OAuth token
2. **🔓 Fetch 24hrs**: Manually checks for changes in the last 24 hours
3. **🧠 Update AI Insights**: Generates insights for changes with complete before/after data

## How It Works

1. The script checks for changes to your Google Ads account in the last 24 hours
2. When a change is detected, it records the details and captures performance metrics for the 14 days before the change
3. After 14 days, it automatically captures performance metrics for the period after the change
4. For completed records (with both before and after data), it can generate AI-powered insights about the impact

## Security Considerations

- Never share your Developer Token, Client Secret, or Refresh Token
- Consider using Script Properties to store sensitive credentials instead of hardcoding them
- Regularly rotate your OAuth credentials

## Troubleshooting

Common issues and their solutions:

- **Authentication errors**: Run the "Unlock Token" function to refresh the access token
- **API errors**: Check the Logs in Apps Script for detailed error messages
- **Missing data**: Ensure your Google Ads account has sufficient historical data

## Customization

The script can be customized in several ways:

- Change the `DAYS_BEFORE` value to adjust the comparison timeframe
- Modify the queries to track different types of changes
- Update the performance metrics collected in the `getPerformanceData` function

## Version History

- **v1-3**: Basic change monitoring with 24-hour lookback
- **v4-6**: Added result limits and improved date handling
- **v7-9**: Enhanced data processing, AI insights, and error handling

## License

This script is provided as-is for educational and practical purposes. Use at your own discretion.

## Acknowledgements

This tool leverages the Google Ads API, Google Apps Script, and Google Sheets to create a powerful yet accessible monitoring system.
