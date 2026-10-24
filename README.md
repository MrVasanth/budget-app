# Budget

A private monthly budget and expense tracker that installs on your phone's home screen.

- **Plan** each month: split your income across Needs, Wants, Savings, Investments and Others.
- **Upload** bank and credit card statement PDFs (password-protected ones too). Claude reads them and sorts every transaction into a category. You only check the few it isn't sure about.
- **See** what's left to spend, and how much that is per day.
- **Add** cash spends with the + button.

Card purchases count on the day you spend, not when the bill arrives. Card bill payments and transfers between your own accounts are kept out of your totals so nothing is counted twice.

## Where your data lives

- The app is hosted on GitHub Pages from this repo. This repo contains **code only, no data**.
- Your data is saved to your **private** `finance-data` repo as a single file, `budget-data.json`.
- Before it leaves your phone, the data is encrypted with your passphrase (PBKDF2-SHA256 + AES-256-GCM). Without the passphrase the file is unreadable, including to GitHub.
- Statement PDFs never leave your phone. Only their text, with account and card numbers hidden, is sent to Anthropic's API to be sorted.
- The GitHub key and Claude key are stored encrypted on your device.

## Tech

React + Vite, pdf.js for reading PDFs, the Claude API (`claude-haiku-5-5`) for sorting, the GitHub contents API for storage. Deployed by `.github/workflows/deploy.yml` on every push to `main`.

```
npm install
npm run build     # outputs dist/
npm run preview   # serves the build at http://localhost:4173
```
