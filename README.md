# onboarding-xray

Alt+click any element in a running app and see the code behind it: component, API call, route, functions and database table.

## Install in 60 seconds

You need Google Chrome. The extension is not in the Chrome Web Store; you install it from a GitHub Release.

1. **Download.** Open the [latest release](https://github.com/dhananjay1906/onboarding-xray/releases/latest) and, under **Assets**, click `onboarding-xray-submission-v1.0.0.zip`.
2. **Unzip.** Right-click the zip and choose **Extract All** (macOS: double-click it). Keep the extracted folder: Chrome loads the extension from it, so do not delete it. `manifest.json` must be directly inside that folder.
3. **Open the extensions page.** Type `chrome://extensions` in the address bar and press Enter.
4. **Turn on Developer mode.** Use the toggle in the top-right corner.
5. **Load the extension.** Click **Load unpacked** (top left) and select the folder from step 2.
6. **Take the tour.** The welcome page opens by itself. Follow step 2 there: it opens the live demo store and asks you to Alt+click **Place order** on the checkout page.

![The welcome tour that opens after install](docs/screenshots/install/welcome-tour.jpg)

If the welcome page does not open, click the puzzle-piece icon in the Chrome toolbar, pin **Onboarding X-Ray**, and click its icon to open the side panel (the **?** button there replays the tour).

**Live demo:** https://onboarding-xray.web.app (the backend sleeps when idle, so the first load can take about a minute).

**On-device model (optional).** Explanations work in the cloud out of the box. For fully private, on-device explanations you need Chrome 139+ on a supported device; step 1 of the tour checks this and shows what to enable.

**Updating.** Download the new zip, unzip it over the old folder (or into a new one), then click the refresh icon on the extension's card at `chrome://extensions`. If you used a new folder, remove the old extension and load the new folder.
