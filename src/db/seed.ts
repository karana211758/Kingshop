import { count } from 'drizzle-orm';
import { db } from './index.ts';
import { products } from './schema.ts';

export const SEED_PRODUCTS = [
  {
    slug: 'upgraded-titan-cameraman',
    nameEn: 'UTC — Upgraded Titan Cameraman',
    nameTh: 'UTC — อัปเกรดไททันคาเมร่าแมน',
    descriptionEn:
      'Camera Tower Defense frontline Titan unit (UTC). Instant automated Roblox account delivery upon purchase.',
    descriptionTh:
      'ยูนิตไททันแนวหน้า Camera Tower Defense (UTC) จัดส่งข้อมูลบัญชี Roblox อัตโนมัติทันทีหลังชำระเงิน',
    category: 'Titan',
    rarity: 'Godly',
    priceSatang: 2000, // 20.00 THB
    stock: 0,
    imageUrl: '/assets/aistudio/4502e52d1094eee24dde0583a4f4d6bb41b277dc9d095f1040ccaf81a76f39b0_81c812d5.webp',
    deliveryAccountUsername: null,
    deliveryAccountPassword: null,
    isActive: true,
  },
  {
    slug: 'upgraded-titan-tv-man',
    nameEn: 'UTTV — Upgraded Titan TV Man',
    nameTh: 'UTTV — อัปเกรดไททันทีวีแมน',
    descriptionEn:
      'Camera Tower Defense high-damage Titan unit (UTTV). Instant automated Roblox account delivery upon purchase.',
    descriptionTh:
      'ยูนิตไททันพลังโจมตีสูง Camera Tower Defense (UTTV) จัดส่งข้อมูลบัญชี Roblox อัตโนมัติทันทีหลังชำระเงิน',
    category: 'Titan',
    rarity: 'Godly',
    priceSatang: 3000, // 30.00 THB
    stock: 0,
    imageUrl: '/assets/aistudio/831c54894de2abcd0ac4aa7f6b1013dd5621fe37f5956810abeafe064fd73370_e5777573.webp',
    deliveryAccountUsername: null,
    deliveryAccountPassword: null,
    isActive: true,
  },
];

let seedPromise: Promise<void> | null = null;

export async function ensureProductsSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        const [{ value }] = await db.select({ value: count() }).from(products);
        if (value === 0) {
          await db
            .insert(products)
            .values(SEED_PRODUCTS)
            .onConflictDoNothing({ target: products.slug });
        }
      } catch (err) {
        seedPromise = null;
        throw err;
      }
    })();
  }
  return seedPromise;
}
