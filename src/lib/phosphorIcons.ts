/**
 * Curated Phosphor icon map for category icons.
 * Maps icon names (strings stored in DB) → Phosphor React components.
 * Backward-compatible: if icon value is not in this map, it renders as emoji text.
 */
import type { Icon } from '@phosphor-icons/react';
import {
  ForkKnife, Coffee, Wine, BeerStein, IceCream, Cookie, Cake, BowlFood,
  Car, Airplane, Train, Bus, Bicycle, Boat,
  ShoppingCart, ShoppingBag, Package, Tag, Storefront,
  House, Wrench, Lamp, Bed, Door, Armchair,
  FirstAidKit, Pill, Heartbeat, Hospital, Stethoscope, Tooth,
  GameController, FilmSlate, MusicNote, Television, Ticket, Books, Confetti,
  CreditCard, Bank, Wallet, Coins, PiggyBank, ChartLine, Receipt, HandCoins, Money,
  GraduationCap, BookOpen, PencilSimple,
  Barbell, PersonSimpleRun,
  Drop, Scissors, Leaf, Sparkle, Shower,
  PawPrint, Dog, Cat, Bird,
  MapPin, Compass, Suitcase, Globe, Camera,
  Lightning, Phone, WifiHigh, Laptop, Desktop, DeviceMobile,
  Baby,
  Gift, Heart, Star,
  Briefcase, Clipboard, Printer,
  TShirt, Sneaker, Watch,
  Bell, Repeat, Play,
  TrendUp, ArrowsClockwise,
  Gear, Hammer, Sun, Moon, Umbrella, Flame,
  ChartBar, Robot, Flask,
} from '@phosphor-icons/react';

// The central map: icon name (stored in DB) → Phosphor component
export const CATEGORY_ICON_MAP: Record<string, Icon> = {
  // Food & Drink
  ForkKnife, Coffee, Wine, BeerStein, IceCream, Cookie, Cake, BowlFood,
  // Transport
  Car, Airplane, Train, Bus, Bicycle, Boat,
  // Shopping
  ShoppingCart, ShoppingBag, Package, Tag, Storefront,
  // Home
  House, Wrench, Lamp, Bed, Door, Armchair,
  // Health
  FirstAidKit, Pill, Heartbeat, Hospital, Stethoscope, Tooth,
  // Entertainment
  GameController, FilmSlate, MusicNote, Television, Ticket, Books, Confetti,
  // Finance
  CreditCard, Bank, Wallet, Coins, PiggyBank, ChartLine, Receipt, HandCoins, Money,
  // Education
  GraduationCap, BookOpen, PencilSimple,
  // Fitness
  Barbell, PersonSimpleRun,
  // Personal Care
  Drop, Scissors, Leaf, Sparkle, Shower,
  // Pets
  PawPrint, Dog, Cat, Bird,
  // Travel
  MapPin, Compass, Suitcase, Globe, Camera,
  // Tech & Utilities
  Lightning, Phone, WifiHigh, Laptop, Desktop, DeviceMobile,
  // Baby
  Baby,
  // Gifts
  Gift, Heart, Star,
  // Office
  Briefcase, Clipboard, Printer,
  // Clothing
  TShirt, Sneaker, Watch,
  // Subscriptions
  Bell, Repeat, Play,
  // Income / Returns
  TrendUp, ArrowsClockwise,
  // Misc
  Gear, Hammer, Sun, Moon, Umbrella, Flame, ChartBar, Robot, Flask,
};

// Human-readable labels for the icon picker grid (used for search)
export const ICON_LABELS: Record<string, string> = {
  ForkKnife: 'food dining', Coffee: 'coffee cafe tea', Wine: 'wine alcohol drink',
  BeerStein: 'beer pub bar', IceCream: 'ice cream dessert', Cookie: 'cookie bakery snack',
  Cake: 'cake birthday', BowlFood: 'bowl meal food',
  Car: 'car vehicle fuel petrol auto', Airplane: 'airplane flight travel air',
  Train: 'train metro subway rail', Bus: 'bus commute transport',
  Bicycle: 'bicycle bike cycle', Boat: 'boat ferry ship',
  ShoppingCart: 'shopping cart purchase', ShoppingBag: 'shopping bag mall',
  Package: 'package delivery parcel', Tag: 'tag label misc other',
  Storefront: 'store shop market',
  House: 'house home rent apartment flat', Wrench: 'wrench repair maintenance plumber',
  Lamp: 'lamp decor light', Bed: 'bed hotel accommodation stay',
  Door: 'door entrance', Armchair: 'armchair sofa furniture',
  FirstAidKit: 'first aid medical health kit', Pill: 'pill medicine pharmacy drug',
  Heartbeat: 'heartbeat health cardio', Hospital: 'hospital clinic doctor',
  Stethoscope: 'stethoscope doctor medical', Tooth: 'tooth dental dentist',
  GameController: 'game gaming controller entertainment',
  FilmSlate: 'film movie cinema theatre', MusicNote: 'music note concert audio',
  Television: 'tv television streaming netflix', Ticket: 'ticket event show',
  Books: 'books library reading', Confetti: 'confetti celebration party',
  CreditCard: 'credit card debit atm', Bank: 'bank savings account',
  Wallet: 'wallet cash pocket', Coins: 'coins money cash',
  PiggyBank: 'piggy bank saving savings', ChartLine: 'chart investment stock mutual fund',
  Receipt: 'receipt bill emi loan', HandCoins: 'hand coins salary wage',
  Money: 'money cash currency', GraduationCap: 'graduation education school college university',
  BookOpen: 'book open study course learning', PencilSimple: 'pencil stationery office write',
  Barbell: 'barbell gym fitness workout', PersonSimpleRun: 'run exercise sport yoga fitness',
  Drop: 'drop water spa', Scissors: 'scissors haircut salon beauty grooming',
  Leaf: 'leaf nature organic eco', Sparkle: 'sparkle beauty personal care',
  Shower: 'shower bath personal care hygiene',
  PawPrint: 'paw print pet vet', Dog: 'dog pet', Cat: 'cat pet', Bird: 'bird pet',
  MapPin: 'map pin location tour', Compass: 'compass explore navigation',
  Suitcase: 'suitcase trip vacation holiday travel', Globe: 'globe international world',
  Camera: 'camera photo photography',
  Lightning: 'lightning electricity electric power utility',
  Phone: 'phone mobile recharge call', WifiHigh: 'wifi internet broadband',
  Laptop: 'laptop tech computer software', Desktop: 'desktop computer digital',
  DeviceMobile: 'mobile device phone app',
  Baby: 'baby child kid infant diaper',
  Gift: 'gift present donation', Heart: 'heart charity donation love',
  Star: 'star premium jewelry jewel',
  Briefcase: 'briefcase office business work insurance', Clipboard: 'clipboard document notes',
  Printer: 'printer print',
  TShirt: 'tshirt shirt clothes clothing apparel', Sneaker: 'sneaker shoe footwear',
  Watch: 'watch accessories wearable',
  Bell: 'bell subscription membership notification', Repeat: 'repeat subscription annual recurring',
  Play: 'play streaming media video',
  TrendUp: 'trend up income earnings returns', ArrowsClockwise: 'arrows refund cashback reimbursement',
  Gear: 'gear settings maintenance', Hammer: 'hammer tools repair',
  Sun: 'sun outdoor weather', Moon: 'moon night', Umbrella: 'umbrella rain insurance',
  Flame: 'flame fire hot gas', ChartBar: 'chart bar analytics data',
  Robot: 'robot ai tech software', Flask: 'flask lab science research',
};

// Grouped for the icon picker UI
export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: 'Food & Drink',    icons: ['ForkKnife', 'Coffee', 'Wine', 'BeerStein', 'IceCream', 'Cookie', 'Cake', 'BowlFood'] },
  { label: 'Transport',       icons: ['Car', 'Airplane', 'Train', 'Bus', 'Bicycle', 'Boat'] },
  { label: 'Shopping',        icons: ['ShoppingCart', 'ShoppingBag', 'Package', 'Storefront', 'Tag'] },
  { label: 'Home',            icons: ['House', 'Wrench', 'Lamp', 'Bed', 'Armchair', 'Door'] },
  { label: 'Health',          icons: ['FirstAidKit', 'Pill', 'Heartbeat', 'Hospital', 'Stethoscope', 'Tooth'] },
  { label: 'Entertainment',   icons: ['GameController', 'FilmSlate', 'MusicNote', 'Television', 'Ticket', 'Books', 'Confetti'] },
  { label: 'Finance',         icons: ['Wallet', 'CreditCard', 'Bank', 'Coins', 'PiggyBank', 'Receipt', 'ChartLine', 'HandCoins', 'Money'] },
  { label: 'Education',       icons: ['GraduationCap', 'BookOpen', 'PencilSimple'] },
  { label: 'Fitness',         icons: ['Barbell', 'PersonSimpleRun'] },
  { label: 'Personal Care',   icons: ['Sparkle', 'Scissors', 'Shower', 'Drop', 'Leaf'] },
  { label: 'Pets',            icons: ['PawPrint', 'Dog', 'Cat', 'Bird'] },
  { label: 'Travel',          icons: ['Suitcase', 'MapPin', 'Compass', 'Globe', 'Camera'] },
  { label: 'Tech & Utilities',icons: ['Lightning', 'WifiHigh', 'Phone', 'DeviceMobile', 'Laptop', 'Desktop'] },
  { label: 'Clothing',        icons: ['TShirt', 'Sneaker', 'Watch'] },
  { label: 'Subscriptions',   icons: ['Bell', 'Repeat', 'Play', 'Star'] },
  { label: 'Income',          icons: ['TrendUp', 'HandCoins', 'ArrowsClockwise', 'ChartBar'] },
  { label: 'Office',          icons: ['Briefcase', 'Clipboard', 'Printer'] },
  { label: 'Kids & Baby',     icons: ['Baby'] },
  { label: 'Gifts',           icons: ['Gift', 'Heart', 'Confetti'] },
  { label: 'Misc',            icons: ['Gear', 'Hammer', 'Sun', 'Moon', 'Umbrella', 'Flame', 'Robot', 'Flask'] },
];

// All icon names as a flat array (for the edge function prompt)
export const ALL_ICON_NAMES = Object.keys(CATEGORY_ICON_MAP);

// Keyword → icon name map for client-side matching
const ICON_KEYWORD_MAP: Record<string, string> = {
  // Food
  food: 'ForkKnife', dining: 'ForkKnife', restaurant: 'ForkKnife', meal: 'ForkKnife',
  eat: 'ForkKnife', lunch: 'ForkKnife', dinner: 'ForkKnife', breakfast: 'ForkKnife',
  coffee: 'Coffee', cafe: 'Coffee', tea: 'Coffee', canteen: 'Coffee',
  wine: 'Wine', alcohol: 'Wine', liquor: 'Wine',
  bar: 'BeerStein', beer: 'BeerStein', pub: 'BeerStein',
  icecream: 'IceCream', dessert: 'IceCream', sweet: 'Cookie',
  bakery: 'Cookie', snack: 'Cookie', biscuit: 'Cookie',
  cake: 'Cake', birthday: 'Cake',
  bowl: 'BowlFood', curry: 'BowlFood',
  // Transport
  transport: 'Car', commute: 'Train', car: 'Car', vehicle: 'Car',
  petrol: 'Car', fuel: 'Car', auto: 'Car', drive: 'Car', taxi: 'Car', cab: 'Car', rickshaw: 'Car',
  flight: 'Airplane', air: 'Airplane', fly: 'Airplane', airline: 'Airplane',
  train: 'Train', metro: 'Train', subway: 'Train', rail: 'Train',
  bus: 'Bus',
  bike: 'Bicycle', cycle: 'Bicycle', bicycle: 'Bicycle',
  boat: 'Boat', ferry: 'Boat', ship: 'Boat',
  // Shopping
  shop: 'ShoppingCart', shopping: 'ShoppingBag', purchase: 'ShoppingCart',
  mall: 'ShoppingBag', store: 'Storefront', market: 'Storefront', supermarket: 'Storefront',
  grocery: 'ShoppingCart', groceries: 'ShoppingCart',
  // Home
  home: 'House', house: 'House', rent: 'House', apartment: 'House', flat: 'House', pg: 'House',
  maintenance: 'Wrench', repair: 'Wrench', plumber: 'Wrench', electrician: 'Wrench',
  furniture: 'Armchair', sofa: 'Armchair', decor: 'Lamp',
  // Health
  health: 'FirstAidKit', medical: 'Hospital', doctor: 'Stethoscope',
  hospital: 'Hospital', clinic: 'Hospital',
  medicine: 'Pill', pharmacy: 'Pill', drug: 'Pill', chemist: 'Pill',
  dental: 'Tooth', dentist: 'Tooth', teeth: 'Tooth',
  gym: 'Barbell', fitness: 'Barbell', workout: 'Barbell',
  exercise: 'PersonSimpleRun', run: 'PersonSimpleRun', yoga: 'PersonSimpleRun', sport: 'PersonSimpleRun',
  // Entertainment
  entertainment: 'GameController', game: 'GameController', gaming: 'GameController',
  movie: 'FilmSlate', film: 'FilmSlate', cinema: 'FilmSlate', theatre: 'FilmSlate',
  music: 'MusicNote', concert: 'MusicNote', audio: 'MusicNote',
  tv: 'Television', netflix: 'Television', video: 'Television', ott: 'Television',
  stream: 'Play', streaming: 'Play',
  event: 'Ticket', ticket: 'Ticket', show: 'Ticket',
  book: 'BookOpen', library: 'Books', reading: 'BookOpen',
  party: 'Confetti', celebration: 'Confetti',
  // Finance
  finance: 'Wallet', money: 'Coins', cash: 'Money',
  bank: 'Bank', atm: 'CreditCard', card: 'CreditCard', credit: 'CreditCard', debit: 'CreditCard',
  saving: 'PiggyBank', savings: 'PiggyBank', piggy: 'PiggyBank',
  investment: 'ChartLine', invest: 'ChartLine', stock: 'ChartLine', mutual: 'ChartLine', sip: 'ChartLine',
  emi: 'Receipt', loan: 'Receipt', bill: 'Receipt',
  insurance: 'Briefcase',
  income: 'TrendUp', salary: 'HandCoins', wage: 'HandCoins', earnings: 'TrendUp', paycheck: 'HandCoins',
  refund: 'ArrowsClockwise', cashback: 'ArrowsClockwise', reimbursement: 'ArrowsClockwise',
  interest: 'TrendUp',
  // Education
  education: 'GraduationCap', school: 'GraduationCap', college: 'GraduationCap',
  university: 'GraduationCap', tuition: 'GraduationCap', course: 'BookOpen',
  study: 'BookOpen', learning: 'BookOpen', coaching: 'GraduationCap',
  // Utilities
  utility: 'Lightning', utilities: 'Lightning', electric: 'Lightning', electricity: 'Lightning', power: 'Lightning',
  water: 'Drop', internet: 'WifiHigh', wifi: 'WifiHigh', broadband: 'WifiHigh',
  phone: 'Phone', mobile: 'DeviceMobile', recharge: 'DeviceMobile',
  // Personal Care
  personal: 'Sparkle', care: 'Sparkle', beauty: 'Scissors', salon: 'Scissors',
  haircut: 'Scissors', spa: 'Drop', grooming: 'Scissors', barber: 'Scissors',
  // Pets
  pet: 'PawPrint', dog: 'Dog', cat: 'Cat', vet: 'PawPrint', bird: 'Bird', aquarium: 'Bird',
  // Travel
  travel: 'Suitcase', trip: 'Suitcase', vacation: 'Suitcase', holiday: 'Suitcase', tour: 'Compass',
  hotel: 'Bed', accommodation: 'Bed', stay: 'Bed', hostel: 'Bed',
  map: 'MapPin', location: 'MapPin',
  camera: 'Camera', photo: 'Camera', photography: 'Camera',
  // Tech
  tech: 'Laptop', computer: 'Desktop', laptop: 'Laptop', device: 'DeviceMobile',
  software: 'Laptop', app: 'DeviceMobile', digital: 'Desktop',
  // Baby
  baby: 'Baby', child: 'Baby', kid: 'Baby', diaper: 'Baby', infant: 'Baby',
  // Gifts
  gift: 'Gift', present: 'Gift', donation: 'Heart', charity: 'Heart', temple: 'Heart', church: 'Heart',
  // Office
  office: 'Briefcase', business: 'Briefcase', work: 'Briefcase',
  stationery: 'PencilSimple', print: 'Printer', document: 'Clipboard',
  // Clothing
  cloth: 'TShirt', clothes: 'TShirt', clothing: 'TShirt', shirt: 'TShirt', apparel: 'TShirt',
  shoe: 'Sneaker', shoes: 'Sneaker', footwear: 'Sneaker',
  watch: 'Watch', jewel: 'Star', jewelry: 'Star', accessory: 'Watch',
  // Subscriptions
  subscription: 'Bell', subscriptions: 'Bell', membership: 'Bell',
  premium: 'Star', annual: 'Repeat', recurring: 'Repeat',
  // Misc
  miscellaneous: 'Tag', misc: 'Tag', other: 'Tag', general: 'Tag',
  parking: 'Car', toll: 'Car', tax: 'Receipt', laundry: 'Shower',
  cleaning: 'Sparkle',
};

/**
 * Returns 3 Phosphor icon name suggestions for a given category name.
 * Uses client-side keyword matching — no API call needed.
 */
export function getSuggestedIcons(categoryName: string): string[] {
  const lower = categoryName.toLowerCase().trim();
  const suggestions: string[] = [];

  // Pass 1: exact keyword substring match
  for (const [keyword, iconName] of Object.entries(ICON_KEYWORD_MAP)) {
    if (lower.includes(keyword) && !suggestions.includes(iconName)) {
      suggestions.push(iconName);
      if (suggestions.length >= 3) break;
    }
  }

  // Pass 2: word overlap match (to fill remaining slots)
  if (suggestions.length < 3) {
    const words = lower.split(/[\s/&_-]+/).filter(w => w.length >= 3);
    for (const word of words) {
      for (const [keyword, iconName] of Object.entries(ICON_KEYWORD_MAP)) {
        if (!suggestions.includes(iconName) && (keyword.includes(word) || word.includes(keyword))) {
          suggestions.push(iconName);
          if (suggestions.length >= 3) break;
        }
      }
      if (suggestions.length >= 3) break;
    }
  }

  // Fallback defaults
  const defaults = ['Tag', 'Wallet', 'Star'];
  for (const d of defaults) {
    if (!suggestions.includes(d)) {
      suggestions.push(d);
      if (suggestions.length >= 3) break;
    }
  }

  return suggestions.slice(0, 3);
}
