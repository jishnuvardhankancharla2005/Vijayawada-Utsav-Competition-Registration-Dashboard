# 🎊 Vijayawada Utsav 2026 – Competition Registration Dashboard & Live ID Generator

An executive, real-time analytics dashboard and automated ID management system for **Vijayawada Utsav 2026** (8–12 October 2026 · Tummalapalli Kalakshetram).

Designed to match the vibrant festive visual identity of the official website, with real-time bidirectional synchronization with Google Sheets responses and zero-mistake automated Registration ID generation.

---

## 🌟 Key Features

1. **⚡ Real-Time Live Google Sheets Sync**:
   - Directly connects to Google Sheets responses across all 3 official registration forms via Google Visualization API (GViz) with instant JSONP fallback (zero CORS issues in any browser environment or `file:///`).
   - Automatically polls for new form submissions every 60 seconds or on-demand via the **"🔄 Sync Live Sheets Now"** button.
   - Status badge shows live connectivity: `🟢 Live Google Sheets Sync: Connected` with real-time response counters.

2. **🏷️ Zero-Mistake Registration ID Generation**:
   - **Crown of Vijayawada**: `VUCR0001` – `VUCR0085+`
   - **Wonder Women of Vijayawada**: `VUWW0001` – `VUWW0027+`
   - **General Competitions**: `VU` + Category prefix (`SJ` Sub Junior, `J` Junior, `S` Senior) + sequential 4 digits (`VUJ0001`, `VUS0002`, `VUSJ0004`, ...).
   - **Intelligent Person-Matching Engine**:
     - Accurately identifies repeat submissions by the same participant (via phone number and normalized name) and assigns them the **same unique ID**.
     - Distinguishes siblings/family members sharing the same parent phone number (assigning each individual child their own distinct ID).
     - Resolves name spelling variations and initials (e.g. `P.` vs `Pasupuleti`, `K.` vs `Koncham`, `Y.` vs `Yarakala`).

3. **🎨 Festive Branding & Rich Visuals**:
   - Vibrant festival color palette: Warm Marigold (`#F2B01E`), Royal Maroon (`#8C1D40`), Midnight Navy (`#1C2145`), and Deep Plum (`#4A1029`).
   - Typography: Google Fonts `Big Shoulders Display`, `Hanken Grotesk`, `Caveat`, and `Tiro Telugu`.
   - Dedicated interactive sections for all 7 competitions (Vijayawada Idol, Vijayawada Champs, Got Talent, Quiz on Vijayawada, Family Talent, Crown of Vijayawada, Wonder Women).
   - High-resolution event posters, KPIs, charts, and participant directory tables with instant live filtering and search.

---

## 📁 Repository Structure

```text
├── index.html                                        # Main live dashboard (ready for GitHub Pages / Vercel)
├── Vijayawada Utsav 2026 – Registration Dashboard.html # Standalone offline/local dashboard
├── Vijayawada_Utsav_Google_Apps_Script.gs           # Ready-to-use Google Apps Script for Google Sheets
├── General_Competitions_Responses_with_IDs.csv      # Sheet 1 responses with generated Registration IDs
├── Wonder_Women_Responses_with_IDs.csv               # Sheet 2 responses with generated Registration IDs
├── Crown_of_Vijayawada_Responses_with_IDs.csv        # Sheet 3 responses with generated Registration IDs
└── vijayawada_assets/                                # High-res official posters and logo
    ├── logo.png
    ├── idol.jpg
    ├── champs.jpg
    ├── talent.jpg
    ├── quiz.jpg
    ├── family.jpg
    ├── crown.jpg
    └── wonder.jpg
```

---

## 📋 Connected Google Response Sheets

| Form / Competition | Google Sheet ID |
| :--- | :--- |
| **General Competitions** (Idol, Champs, Talent, Quiz, Family) | `19TGx08ZSiWVrelAQ2esXTTwb0r82Z-5wUbuexBJYdLQ` |
| **Wonder Women of Vijayawada** | `1KbDhfum05VTqvbGqRSWYdwXYKhIT0jFciATFq7naI-o` |
| **Crown of Vijayawada** | `1z6zOxFS349r1mBOVR3G7o6IEZADdv1sL05ucKpTiJkY` |

---

## ⚙️ How to Save Registration IDs in Google Sheets (Step-by-Step)

To automatically generate and store the `Registration ID` column directly inside your live Google Sheets for both past entries and future submissions:

1. Open your Google Sheet in Chrome/browser.
2. In the top menu bar, click **Extensions** ➔ **Apps Script**.
3. Clear out any sample code, and paste the contents of [`Vijayawada_Utsav_Google_Apps_Script.gs`](./Vijayawada_Utsav_Google_Apps_Script.gs).
4. Click the **Save** icon (💾).
5. In the toolbar function dropdown, select **`generateAndSaveAllIDs`** and click **Run**:
   - Click "Review Permissions" and allow Google authorization.
   - The script will automatically insert **Column A: `Registration ID`** and populate all existing rows with their exact matched IDs in less than 2 seconds!
6. **Set up the Auto-Trigger for New Form Submissions**:
   - In the left sidebar of Apps Script, click the **Triggers** icon (⏰ Alarm Clock).
   - Click **+ Add Trigger** (bottom right).
   - Choose function to run: `onFormSubmitTrigger`
   - Select event source: `From spreadsheet`
   - Select event type: `On form submit`
   - Click **Save**.

*Every new entry submitted through Google Forms will now instantly receive its official Registration ID in Column A without any manual intervention!*

---

## 🚀 Running the Dashboard Locally

Simply double-click `index.html` or `Vijayawada Utsav 2026 – Registration Dashboard.html` in any browser (Chrome, Edge, Firefox, Safari).

The dashboard will automatically:
1. Render cached participants and instant analytics.
2. Connect to the live Google Sheets in the background.
3. Update stats, entry counters, and directory tables seamlessly.

---

© 2026 Vijayawada Utsav Committee. All rights reserved.
