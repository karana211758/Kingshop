import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// Users table (strictly NO phone number column; supports Username + Email + optional Firebase UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('USER'), // 'USER' | 'ADMIN' | 'OWNER'
  balanceSatang: integer('balance_satang').notNull().default(0),
  totalToppedUpSatang: integer('total_topped_up_satang').notNull().default(0),
  totalSpentSatang: integer('total_spent_satang').notNull().default(0),
  isBanned: boolean('is_banned').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Active Sessions with hashed rotating refresh tokens
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull().unique(),
  userAgent: text('user_agent').notNull(),
  maskedIp: text('masked_ip').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Camera Tower Defense product catalog
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameTh: text('name_th').notNull(),
  descriptionEn: text('description_en').notNull(),
  descriptionTh: text('description_th').notNull(),
  category: text('category').notNull(), // 'Titan' | 'Mythic' | 'Godly'
  rarity: text('rarity').notNull(),
  priceSatang: integer('price_satang').notNull(),
  stock: integer('stock').notNull().default(0),
  imageUrl: text('image_url').notNull(),
  deliveryAccountUsername: text('delivery_account_username'),
  deliveryAccountPassword: text('delivery_account_password'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Orders table
export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id)
    .notNull(),
  productNameSnapshot: text('product_name_snapshot').notNull(),
  productImageSnapshot: text('product_image_snapshot').notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceSatang: integer('unit_price_satang').notNull(),
  totalSatang: integer('total_satang').notNull(),
  robloxUsername: text('roblox_username').notNull().default('Account Vault'),
  deliveredAccountUsername: text('delivered_account_username'),
  deliveredAccountPassword: text('delivered_account_password'),
  deliveredAccountsJson: text('delivered_accounts_json'),
  status: text('status').notNull().default('PENDING_DELIVERY'), // 'PENDING_DELIVERY' | 'DELIVERED' | 'REFUNDED'
  adminDeliveryNote: text('admin_delivery_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Multi-account stock vault per product (each row = 1 real Roblox account for UTC/UTTV)
export const productAccounts = pgTable('product_accounts', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  accountUsername: text('account_username').notNull(),
  accountPassword: text('account_password').notNull(),
  note: text('note'),
  isSold: boolean('is_sold').notNull().default(false),
  soldToOrderId: text('sold_to_order_id').references(() => orders.id, {
    onDelete: 'set null',
  }),
  soldAt: timestamp('sold_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Top-Up Transactions with UNIQUE external_ref to block voucher replay
export const topupTransactions = pgTable('topup_transactions', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  channel: text('channel').notNull(), // 'TRUEMONEY_VOUCHER'
  requestedSatang: integer('requested_satang').notNull(),
  creditedSatang: integer('credited_satang').notNull().default(0),
  externalRef: text('external_ref').notNull().unique(),
  voucherUrlMasked: text('voucher_url_masked'),
  voucherUrlEncrypted: text('voucher_url_encrypted'),
  slipReference: text('slip_reference'),
  status: text('status').notNull().default('PENDING'), // 'PENDING' | 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED'
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Immutable double-entry wallet ledger
export const walletLedger = pgTable('wallet_ledger', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  type: text('type').notNull(), // 'TOPUP_VOUCHER' | 'TOPUP_QR' | 'PURCHASE' | 'REFUND' | 'ADMIN_ADJUST'
  deltaSatang: integer('delta_satang').notNull(),
  balanceBeforeSatang: integer('balance_before_satang').notNull(),
  balanceAfterSatang: integer('balance_after_satang').notNull(),
  referenceId: text('reference_id').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Immutable security & financial activity logs
export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  status: text('status').notNull().default('SUCCESS'),
  deltaSatang: integer('delta_satang'),
  balanceBeforeSatang: integer('balance_before_satang'),
  balanceAfterSatang: integer('balance_after_satang'),
  maskedIp: text('masked_ip').notNull(),
  deviceSummary: text('device_summary').notNull(),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Banned IPs managed by Owner/Admins
export const bannedIps = pgTable('banned_ips', {
  id: serial('id').primaryKey(),
  maskedIp: text('masked_ip').notNull().unique(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Server-side Store Settings (receiving TrueMoney phone, QR image path, display name)
export const storeSettings = pgTable('store_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drizzle Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  orders: many(orders),
  topupTransactions: many(topupTransactions),
  walletLedger: many(walletLedger),
  activityLogs: many(activityLogs),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [orders.productId],
    references: [products.id],
  }),
  deliveredAccounts: many(productAccounts),
}));

export const productAccountsRelations = relations(productAccounts, ({ one }) => ({
  product: one(products, {
    fields: [productAccounts.productId],
    references: [products.id],
  }),
  soldOrder: one(orders, {
    fields: [productAccounts.soldToOrderId],
    references: [orders.id],
  }),
}));

export const topupTransactionsRelations = relations(topupTransactions, ({ one }) => ({
  user: one(users, {
    fields: [topupTransactions.userId],
    references: [users.id],
  }),
}));

export const walletLedgerRelations = relations(walletLedger, ({ one }) => ({
  user: one(users, {
    fields: [walletLedger.userId],
    references: [users.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));
