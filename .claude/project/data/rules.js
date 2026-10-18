window.HUB_DATA = window.HUB_DATA || {};
window.HUB_DATA["rules"] = /*DATA*/
{
  "rules": [
    {
      "title": "\"build\" — finalize & ship a debug build",
      "body": "When I say **build** (or anything meaning \"finalize the changes and make a debuggable APK\"):\n1. Promote the **Pending** changes in the Versions tab into a new version number (ask which segment to bump if unclear) and update the version in `meta.js` **and** the in-app version constant.\n2. Give me the GitHub commit **summary + description** (description ends with the co-author line).\n3. Point me to `build.bat` — it makes the debug **profile** build. Profile build always, unless I change it."
    },
    {
      "title": "\"commit\" — commit text only",
      "body": "When I say **commit**: give me the GitHub commit **summary + description** (description ends with the co-author line). Nothing else — no version bump, no build."
    },
    {
      "title": "\"merge\" — GitHub Desktop walkthrough",
      "body": "When I say **merge**: give me the merge details (what branch into what, conflicts to expect) and the exact steps to do it in the **GitHub Desktop app**."
    },
    {
      "title": "Co-author line",
      "body": "Every commit description ends with:\n`Co-Authored-By: Claude <noreply@anthropic.com>`\nNo model name."
    },
    {
      "title": "build.bat is the build path",
      "body": "A `build.bat` sits at the project root (created during setup for the chosen framework). I double-click it to build. If I say the build is broken: **fix the .bat first**, also give me the terminal command (with `cd`), and if the root cause can't be found — run the build yourself on my behalf."
    },
    {
      "title": "\"later\" goes to Notes for later",
      "body": "Any time I say I'll do/decide something *later*, it goes **immediately** into Checklist → *Notes for later*. Remove the item only when it's actually resolved."
    },
    {
      "title": "Deferred decisions get re-asked",
      "body": "Questions I skipped live in the Decisions tab as *deferred/open*. Whenever related work surfaces, the AI asks again — and keeps asking until I make the call."
    },
    {
      "title": "Competitor analysis on demand",
      "body": "After my app's scope is clear during setup, the AI asks if I want a competitor analysis **and proposes the competitor list in the same message** so I can add or remove names before deciding. If I say yes, it researches each one into the Competitors tab (grade vs. MY scope, feature table, strengths/weaknesses, verdict). Any competitor I add via **+ Competitor** in the hub is marked *awaiting research* — the AI fills it in when it sees it or when I say \"fill in the competitor analysis\"."
    },
    {
      "title": "Hub & design system get restyled per project",
      "body": "The starter pack ships neutral/bland on purpose. Right after the questionnaire, the AI restyles `hub.html` and `design-system.html` to match THIS app's visual identity."
    }
  ]
}
/*END*/;
