import type { Language, VideoData } from '../src/engine/types.ts';

export const TEST_FIXTURES: Record<Language, VideoData> = {
  en: {
    topic: 'Sleep & Health',
    language: 'en',
    rounds: [
      {
        lines: ['You can catch up', 'on lost sleep', 'on weekends.'],
        fact: false,
        proof: ['Sleep debt cannot be fully', 'recovered in two days'],
        source: 'https://www.sleepfoundation.org/how-sleep-works/sleep-debt',
        confidence: 'high'
      },
      {
        lines: ['Your brain stays', 'active while you', 'are sleeping.'],
        fact: true,
        proof: ['Brain clears toxins and', 'sorts memories overnight'],
        source: 'https://www.nih.gov/news-events/nih-research-matters/how-sleep-clears-brain',
        confidence: 'high'
      },
      {
        lines: ['Adults need less', 'sleep as they', 'grow older.'],
        fact: false,
        proof: ['Older adults still require', '7 to 8 hours nightly'],
        source: 'https://www.cdc.gov/sleep/about_sleep/how_much_sleep.html',
        confidence: 'high'
      },
      {
        lines: ['Phone screens', 'before bed delay', 'your sleep cycle.'],
        fact: true,
        proof: ['Blue light shifts sleep', 'timing by up to 2 hours'],
        source: 'https://www.health.harvard.edu/staying-healthy/blue-light-has-a-dark-side',
        confidence: 'high'
      }
    ],
    recap: [
      'Weekend catch-up sleep',
      'Active brain in sleep',
      'Sleep needs in old age',
      'Phone screen blue light'
    ]
  },
  hinglish: {
    topic: 'Health & Daily Habits',
    language: 'hinglish',
    rounds: [
      {
        lines: ['Knuckles todne se', 'arthritis ho jaati', 'hai.'],
        fact: false,
        proof: ['Studies mein knuckle cracking', 'aur arthritis ka link nahi mila'],
        source: 'https://www.health.harvard.edu/pain/does-knuckle-cracking-cause-arthritis',
        confidence: 'high'
      },
      {
        lines: ['Baadal wale din', 'bhi sunscreen', 'zaroori hai.'],
        fact: true,
        proof: ['Baadalon se bhi UV kirnein', '80% tak pahunch sakti hain'],
        source: 'https://www.epa.gov/sunsafety/action-steps-sun-safety',
        confidence: 'high'
      },
      {
        lines: ['Thandi hawa lagne', 'se sardi-zukaam', 'hota hai.'],
        fact: false,
        proof: ['Zukaam virus se hota hai,', 'thandi hawa se nahi'],
        source: 'https://www.hopkinsmedicine.org/health/conditions-and-diseases/common-cold',
        confidence: 'high'
      },
      {
        lines: ['Kam neend se', 'zukaam ka risk', 'badhta hai.'],
        fact: true,
        proof: ['6 ghante se kam sone par', 'risk 4 guna tak badhta hai'],
        source: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4568388/',
        confidence: 'high'
      }
    ],
    recap: [
      'Knuckles aur arthritis',
      'Baadal mein sunscreen',
      'Thandi hawa aur zukaam',
      'Kam neend aur zukaam'
    ]
  },
  hi: {
    topic: 'भोजन और फिटनेस',
    language: 'hi',
    rounds: [
      {
        lines: ['रात को फल खाने से', 'शरीर का वजन', 'बढ़ता है।'],
        fact: false,
        proof: ['कैलोरी का समय नहीं बल्कि', 'कुल मात्रा मायने रखती है'],
        source: 'https://www.mayoclinic.org/healthy-lifestyle/weight-loss/in-depth/metabolism/art-20046508',
        confidence: 'high'
      },
      {
        lines: ['पानी पीने से', 'शरीर का मेटाबॉलिज्म', 'तेज होता है।'],
        fact: true,
        proof: ['500ml पानी से मेटाबॉलिज्म', '30% तक बढ़ सकता है'],
        source: 'https://pubmed.ncbi.nlm.nih.gov/14671205/',
        confidence: 'high'
      },
      {
        lines: ['अंडे का पीला भाग', 'दिल के लिए', 'खतरनाक होता है।'],
        fact: false,
        proof: ['संतुलित मात्रा में अंडा', 'हार्ट अटैक का रिस्क नहीं बढ़ाता'],
        source: 'https://www.hsph.harvard.edu/nutritionsource/food-features/eggs/',
        confidence: 'high'
      },
      {
        lines: ['हल्दी वाला दूध', 'शरीर की सूजन', 'कम करता है।'],
        fact: true,
        proof: ['हल्दी में करक्यूमिन', 'सूजन घटाने में असरदार है'],
        source: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5664031/',
        confidence: 'high'
      }
    ],
    recap: [
      'रात में फल और वजन',
      'पानी और मेटाबॉलिज्म',
      'अंडा और दिल की सेहत',
      'हल्दी दूध और सूजन'
    ]
  }
};
