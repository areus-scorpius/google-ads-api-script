Below is the **updated workflow and script**

✅ **Track changes in bid strategy and budget (Scenario 1)**  
✅ **Monitor keyword & audience changes if no budget/bid changes (Scenario 2)**  
✅ **Detect sudden CPC & CTR spikes/drops (Scenario 3)**  
✅ **Automatically update Google Sheets with data from 14 days before and after each change event**  
✅ **Fetch auction insights if there are drastic CPC/CTR changes**  

---

## **📝 STEP 1: Set Up Google Sheets for Advanced Tracking**
### **📌 What You Need to Do**
1. Open **Google Sheets** ([click here](https://docs.google.com/spreadsheets/)).  
2. Click **Blank Spreadsheet** and rename it to **"Google Ads Change Tracker"**.  
3. In **Row 1**, enter the following headers:
   ```
   Campaign Name | Campaign ID | CPC Before | CPC After | CTR Before | CTR After | Conversion Rate Before | Conversion Rate After | Changes Events | Change Events ID | Change Event Date | Change Event Summary | Auction Insights | AI Insights
   ```
4. Click **File > Share > Change to Anyone with the Link > Viewer**.  

**🎯 Done!** Your spreadsheet is ready.

---

## **📝 STEP 2: Connect Google Ads API for Tracking Changes**
### **📌 What You Need to Do**
1. **Set up Google Ads API** ([Guide](https://developers.google.com/google-ads/api/docs/start)).  
   - Enable **Google Ads API** in your Google Cloud project.  
   - Get your **API Key** and **Google Ads Account ID**.  
   - Copy and save them for later use.  

2. **Open Google Sheets** and click **Extensions > Apps Script**.  

3. Copy-paste the script -- See appScript.js

---

## **📝 STEP 3: Automate AI Insights & Alerts**
### **📌 What You Need to Do**
1. Use **Zapier** to connect **OpenAI** to Google Sheets.  
2. Follow the same **Zapier AI integration** steps as before.  
3. Use this updated **prompt** in Zapier:  
   ```
   Analyze the Google Ads campaign data and provide recommendations: CPC Before: {{CPC Before}}, CPC After: {{CPC After}}, CTR Before: {{CTR Before}}, CTR After: {{CTR After}}, Change Event Summary: {{Change Event Summary}}.
   ```

---

## **🚀 Wrapping Up**
🔹 **Automatically track** bid strategy, budget, keywords, and audience changes.  
🔹 **Detect sudden CPC & CTR spikes/drops** and log auction insights.  
🔹 **AI generates insights** based on historical performance.  
🔹 **Alerts notify** managers of critical changes.  
