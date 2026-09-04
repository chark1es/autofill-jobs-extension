# Carbon

Carbon is a Chrome extension that helps you fill out job applications using details you save once. Keep your contact information, work history, education, and resume in one place, then use them across application forms.

It matches common fields using your saved details first. Optional AI support through OpenRouter helps answer questions that need more context.

**You stay in control: Carbon fills fields, but does not submit applications.**

## What it can do

- Fill contact details, dropdowns, radio buttons, and checkboxes.
- Fill work history and education sections from your saved entries.
- Import a resume and attach it to supported resume upload fields.
- Import visible information from your open LinkedIn profile.
- Generate answers with OpenRouter when your saved details do not directly match a question.
- Back up and restore your profile with a JSON file.

## Install

You will need Chrome and Bun installed. The steps below load the extension from this project's source code.

1. Download or clone this repository and open a terminal in its folder.
2. Install the dependencies and build the extension:

   ```sh
   bun install
   bun run build
   ```

3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Click **Load unpacked** and select the project's `dist` folder.
6. Pin Carbon from Chrome's extensions menu for easy access.

After rebuilding, click **Reload** on Carbon's extension card and refresh any application tabs you already have open.

## Use Carbon

1. **Open Carbon.** Click its toolbar icon, or use the Carbon button at the edge of a webpage to open the side panel.
2. **Add your details.** Enter your information under **Profile** and add work history and education under **Jobs**. Changes save automatically.
3. **Add a resume.** Open **Resume** and choose a PDF, DOCX, TXT, or Markdown file. Review the imported details in **Profile** and **Jobs**.
4. **Open an application.** Go to the application form, then open Carbon's **Fill** tab to see the detected fields. Use **Scan again** if the page changes.
5. **Click Fill.** Check the results, correct anything that needs attention, and submit the application yourself when you are ready.

You can also fill using **Ctrl+Shift+F** on Windows or Linux, or **Command+Shift+F** on macOS. Manage the shortcut at `chrome://extensions/shortcuts`.

To pause Carbon, turn off its enable switch. This hides the page button and prevents fills. Reopen the toolbar popup to turn it back on.

### Import from LinkedIn

Open your LinkedIn profile in a browser tab, then choose **Import LinkedIn** in Carbon's **Settings**. You can also use **Import from this tab** in the **Fill** tab while viewing your profile.

Carbon reads the profile page you have open. Review the imported details, since information that is not loaded or visible may be missing.

### Optional AI answers

In **Settings**, enter your OpenRouter API key and select a model. You can choose **Custom** to enter a model ID.

Once configured, Carbon can generate answers during a fill. Without a key, it still fills fields from your saved information. Review generated answers before submitting.

Adding a key also enables AI-assisted resume parsing when you upload a resume. To keep resume parsing local, leave the key empty.

## Your data

- **Local storage:** Your profile, resume, saved answers, and settings are stored in Chrome's local extension storage.
- **AI requests:** When generating answers, Carbon sends profile context, application questions, and the page title to OpenRouter and the selected model provider. AI-assisted resume parsing sends extracted resume text.
- **Backups:** Use **Settings → Export** to save your data as JSON. The export includes your profile and resume, but excludes your OpenRouter key.
- **Restore:** Use **Settings → Import file** to replace your saved candidate data with an export. Your existing OpenRouter key is kept.
- **Clear data:** **Clear file** removes candidate data while keeping settings. Remove your API key separately if needed.

Carbon requests access to websites so it can detect and fill forms across different employers' sites. Exported backups contain personal information, so store them somewhere private.

## Troubleshooting

- **No fields found:** Wait for the application form to load, then click **Scan again**. Carbon works on regular HTTP and HTTPS webpages, not Chrome's internal pages.
- **Some fields were skipped or failed:** Check Carbon's results and complete those fields manually. Custom forms and upload controls may need extra attention.
- **AI answers are unavailable:** Check your OpenRouter key, selected model, and available credits in your OpenRouter account.
- **Resume details are incomplete:** Correct them under **Profile** and **Jobs**. Scanned, image-only PDFs may not contain text Carbon can extract.
- **Carbon stopped working after an update:** Reload the extension at `chrome://extensions`, then refresh the webpage.

## Development

Built with TypeScript, Preact, Vite, and Chrome Manifest V3. Bun manages dependencies and runs tests.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start Vite for development. |
| `bun run build` | Check TypeScript and build the extension into `dist`. |
| `bun test` | Run the automated tests. |

The main code lives in `src/ui` (interface), `src/content` (page detection and filling), `src/background` (background tasks), and `src/lib` (storage, resume parsing, and AI requests). Sample forms for manual checks are in `fixtures`.

## License

MIT. See [LICENSE](LICENSE).
