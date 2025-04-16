# Google Ads Change Monitoring Script README

## TLDR
This script automatically monitors changes in Google Ads accounts (budgets, bids, keywords, audiences), tracks performance metrics before and after these changes, and generates insights on the impact of these modifications.

## Overview

This Google Apps Script connects to the Google Ads API to monitor account changes and analyze their impact on performance. The script:

- Detects changes to budgets, bidding strategies, keywords, audiences, and other campaign elements
- Records these changes in a Google Sheet with performance metrics (CPC, CTR, conversion rates) from before the change
- Continues monitoring performance metrics after the change (for up to 14 days or until the next change)
- Generates insights that highlight the percentage changes in key metrics

The script outputs data to two main spreadsheets:
- **Budget Monitoring**: The primary sheet that contains all detected changes, performance metrics, and insights
- **campaignIgnore**: A tracking sheet that helps prevent duplicate processing of changes

The monitoring process looks at a 14-day window before changes to establish baseline performance and then tracks metrics after changes to quantify their impact. When a campaign has multiple changes, the script identifies these "cut-off" events and adjusts the analysis periods accordingly.

## Functions

### Authentication and Setup
- `refreshAccessToken()`: Manually refreshes the OAuth token needed for Google Ads API access
- `getAccessToken()`: Retrieves the current token or gets a new one if needed
- `onOpen()`: Creates a custom menu in the spreadsheet for manual operations

### Main Operations
- `runMonitoring()`: The primary function that orchestrates the entire monitoring process
- `ensureCutoffInsightsColumn()`: Ensures the "Cut-off Insights" column exists in the spreadsheet
- `fixEmptyMetricsValues()`: Replaces empty values in metrics columns with zeros
- `reformatChangeSummaries()`: Improves the formatting of change descriptions

### Change Detection
- `checkBidBudgetChanges()`: Queries the API for changes related to bids and budgets
- `checkKeywordAudienceChanges()`: Queries the API for changes related to keywords and audiences
- `processChangeEvents()`: Filters and processes the change events returned from API queries
- `callGoogleAdsApi()`: Executes the API requests with error handling and token refreshing

### Processing and Analysis
- `processChanges()`: Adds detected changes to the spreadsheet with performance data
- `getPerformanceData()`: Retrieves performance metrics for a campaign during a specified date range
- `createHumanReadableSummary()`: Creates readable descriptions of technical changes
- `createFormattedBudgetSummary()`: Formats budget changes from raw API data
- `formatBiddingStrategyChange()`: Formats bidding strategy changes from raw API data

### Follow-up Analysis
- `checkCutoffAndFourteenDayUpdates()`: Updates performance data after the change period
- `calculatePercentChange()`: Calculates percentage changes between before/after metrics
- `formatMetricChanges()`: Creates human-readable descriptions of metric changes
- `updateCutoffInsights()`: Manually triggers updates to the insights for existing changes

### Helper Functions
- `extractBiddingStrategyType()`: Determines the bidding strategy type from campaign data
- `extractBidValue()`: Extracts the bid value based on the strategy type
- `formatStrategyName()`: Converts technical strategy names to readable format

## Rules and Limitations

- **API Access**: Requires proper Google Ads API credentials and OAuth setup
- **Data Freshness**: The script should be run daily to capture all changes (ideally with a time-based trigger)
- **Rate Limits**: Subject to Google Ads API rate limits, which may cause issues with very large accounts
- **Overlapping Changes**: When multiple changes occur close together, impact analysis becomes less precise
- **Sheet Structure**: Requires specific columns in the Budget Monitoring and campaignIgnore sheets
- **Metrics Delay**: Google Ads data may have reporting delays affecting same-day analysis
- **Change Detection**: Limited to changes that are visible through the Google Ads API change history

## How to Use

### Initial Setup

1. **Configure the Script**:
   - Update the `CONFIG` object with your Google Ads API credentials and spreadsheet ID
   - Set the correct customer IDs for the account you want to monitor

2. **Prepare the Spreadsheets**:
   - Create a "Budget Monitoring" sheet with the required columns
   - Create a "campaignIgnore" sheet with columns for tracking processed changes

3. **Deploy the Script**:
   - Save the script in Google Apps Script editor
   - Run the `onOpen()` function once to create the custom menu
   - Grant necessary permissions when prompted

### Daily Operation

1. **Manual Execution**:
   - Open the spreadsheet
   - Use the "🎛️ Console 🎛️" menu to run operations:
     - "🔐 Unlock Token" to refresh the access token
     - "🔓 Fetch 24hrs" to detect changes from the past 24 hours
     - "📊 Update Cut-off Insights" to update metrics for existing changes

2. **Automated Execution**:
   - Set up a time-driven trigger to run `runMonitoring()` daily
   - Recommended to run in the morning to capture previous day's changes

### Reading Results

1. **Budget Monitoring Sheet**:
   - Review newly added changes
   - Check the "Change Event Summary" column for a description of each change
   - After 14 days (or when cut off by a newer change), check the "Cut-off Insights" column for performance impact

2. **Troubleshooting**:
   - Check the Apps Script execution logs for error messages
   - If changes are missing, verify API access and try running "🔐 Unlock Token"
   - For missing insights, run "📊 Update Cut-off Insights" manually

The script is designed to help PPC managers understand the impact of their account changes and make data-driven decisions for future optimizations.
