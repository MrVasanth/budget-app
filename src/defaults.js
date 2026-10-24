// Starting setup: the five budget groups, categories and your accounts.
// Everything here can be changed inside the app.

export const GROUPS = [
  { id: 'needs', name: 'Needs', kind: 'spend' },
  { id: 'wants', name: 'Wants', kind: 'spend' },
  { id: 'savings', name: 'Savings', kind: 'save' },
  { id: 'investments', name: 'Investments', kind: 'save' },
  { id: 'others', name: 'Others', kind: 'spend' },
];

// Not budgeted: money coming in, and money moving between your own accounts.
export const SPECIAL_GROUPS = [
  { id: 'income', name: 'Income', kind: 'income' },
  { id: 'ignore', name: 'Not counted', kind: 'ignore' },
];

export const ALL_GROUPS = [...GROUPS, ...SPECIAL_GROUPS];

// hint = examples that help the statement reader pick the right category.
export const DEFAULT_CATEGORIES = [
  { id: 'rent', group: 'needs', name: 'Rent', hint: 'house rent, society maintenance' },
  { id: 'groceries', group: 'needs', name: 'Groceries', hint: 'Zepto, Blinkit, BigBasket, DMart, Swiggy Instamart, JioMart, kirana, vegetables, milk' },
  { id: 'bills', group: 'needs', name: 'Utilities & bills', hint: 'electricity, mobile recharge, broadband, Airtel, Jio, Vi, gas cylinder, water, DTH' },
  { id: 'transport', group: 'needs', name: 'Transport', hint: 'Uber, Ola, Rapido, auto, fuel/petrol, metro, bus, parking, FASTag' },
  { id: 'health', group: 'needs', name: 'Health', hint: 'pharmacy, hospital, doctor, lab tests, Apollo, PharmEasy, Tata 1mg' },
  { id: 'household', group: 'needs', name: 'Household', hint: 'home supplies, repairs, maid or cook salary, Urban Company, laundry' },
  { id: 'emi', group: 'needs', name: 'Insurance & EMIs', hint: 'loan EMI, insurance premium, LIC' },

  { id: 'eating_out', group: 'wants', name: 'Eating out', hint: 'Swiggy, Zomato, restaurants, cafes, tea, snacks' },
  { id: 'shopping', group: 'wants', name: 'Shopping', hint: 'Amazon, Flipkart, Myntra, Ajio, Nykaa, clothes, electronics' },
  { id: 'entertainment', group: 'wants', name: 'Entertainment', hint: 'movies, BookMyShow, PVR, events, games' },
  { id: 'subscriptions', group: 'wants', name: 'Subscriptions', hint: 'Netflix, Spotify, Prime, YouTube Premium, Hotstar, apps, iCloud, Google One' },
  { id: 'travel', group: 'wants', name: 'Travel', hint: 'IRCTC, flights, hotels, MakeMyTrip, Goibibo, trips' },
  { id: 'personal', group: 'wants', name: 'Personal care', hint: 'salon, grooming, gym, fitness' },

  { id: 'emergency', group: 'savings', name: 'Emergency fund', hint: 'money moved to an emergency fund, FD or RD' },
  { id: 'goals', group: 'savings', name: 'Savings goals', hint: 'money put aside for a goal' },

  { id: 'mf', group: 'investments', name: 'Mutual fund SIPs', hint: 'SIP, mutual fund, Groww, Zerodha Coin, Kuvera, BSE StAR MF, NACH debit to an AMC' },
  { id: 'stocks', group: 'investments', name: 'Stocks', hint: 'Zerodha, Upstox, Angel One, stock broker' },
  { id: 'ppf', group: 'investments', name: 'PPF / NPS', hint: 'PPF, NPS, Sukanya Samriddhi' },

  { id: 'family', group: 'others', name: 'Family', hint: 'money sent to parents or family' },
  { id: 'gifts', group: 'others', name: 'Gifts & donations', hint: 'gifts, donations, charity' },
  { id: 'charges', group: 'others', name: 'Fees & charges', hint: 'bank charges, card annual fee, GST on fees, interest, late fee, penalties' },
  { id: 'misc', group: 'others', name: 'Miscellaneous', hint: 'anything that fits nowhere else' },

  { id: 'salary', group: 'income', name: 'Salary', hint: 'salary credit from employer' },
  { id: 'other_income', group: 'income', name: 'Other income', hint: 'interest, dividends, cashback, freelance, any other money received' },

  { id: 'card_payment', group: 'ignore', name: 'Credit card bill payment', hint: 'paying a credit card bill from a bank account (CRED, BillDesk, "CC payment"), or the payment received line on a card statement' },
  { id: 'self_transfer', group: 'ignore', name: 'Transfer between my accounts', hint: 'moving money between the user\'s own bank accounts or wallets' },
];

// mono = the two letters on the badge, hue = badge colour.
export const DEFAULT_ACCOUNTS = [
  { id: 'hdfc', name: 'HDFC', type: 'bank', mono: 'HD', hue: 260 },
  { id: 'sbi', name: 'SBI', type: 'bank', mono: 'SB', hue: 225 },
  { id: 'idfc', name: 'IDFC', type: 'bank', mono: 'ID', hue: 15 },
  { id: 'kotak', name: 'Kotak', type: 'bank', mono: 'KO', hue: 45 },
  { id: 'cash', name: 'Cash', type: 'cash', mono: '₹', hue: 140 },
  { id: 'regalia', name: 'Regalia Gold', type: 'card', mono: 'RG', hue: 85 },
  { id: 'idfc_card', name: 'IDFC Classic', type: 'card', mono: 'IC', hue: 340 },
  { id: 'scapia', name: 'Scapia', type: 'card', mono: 'SC', hue: 300 },
];

export const ACCOUNT_HUES = [260, 225, 15, 45, 140, 85, 340, 300, 190, 110];

export function emptyState() {
  const now = Date.now();
  return {
    v: 1,
    settings: { accounts: DEFAULT_ACCOUNTS, categories: DEFAULT_CATEGORIES, updatedAt: now },
    apiKey: { value: '', updatedAt: 0 },
    rules: {},
    months: {},
    txns: {},
    imports: {},
  };
}
