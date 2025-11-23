# Natural Products E-Commerce Platform

## Overview

This project is a comprehensive e-commerce platform specializing in natural and organic products. It features a React-based Single Page Application (SPA) for the storefront and a Node.js/Express backend. The platform aims to provide a seamless online shopping experience for customers, complemented by robust administrative tools for managing products, orders, and customer data. Key capabilities include a role-based access control system (supporting administrators, marketers, consultants, and customers) and integrations with external services for payments, delivery, and email verification. The business vision is to capture a significant share of the natural products market by offering a user-friendly and efficient online retail solution.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Routing:**
- React 18 with TypeScript, utilizing Wouter for client-side routing.
- Single Page Application (SPA) with `React.lazy()` and `Suspense` for code splitting.
- Intelligent prefetching system adaptively loads pages based on user authentication status and internet quality.

**UI & Styling:**
- Shadcn UI component library and Tailwind CSS for a utility-first approach.
- Custom color palette (green, beige, gold accents) with a mobile-first responsive design.
- Typography uses Open Sans for body text and Playfair Display/Lora for headings.
- Supports light and dark modes.

**State Management:**
- Zustand manages global application state.
- TanStack Query (React Query v5) handles server state management and caching.
- React Hook Form with Zod validation is used for form handling.

### Backend Architecture

**Server Framework:**
- Node.js with Express.js, developed in TypeScript for type safety.
- RESTful API endpoints are structured under `/api`.

**Authentication & Authorization:**
- Session-based authentication with a PostgreSQL session store.
- `bcrypt` for secure password hashing.
- Role-based access control (RBAC) implemented via middleware, supporting Customer, Consultant, Marketer, and Admin roles.
- All authorization checks are strictly enforced on the backend.

**File Upload:**
- `Multer` middleware handles `multipart/form-data` for uploading product images and chat attachments.
- Files are stored in the `/uploads` directory, supporting JPEG, PNG, and WEBP formats.

**Real-time Communication:**
- A WebSocket server (`ws` library) facilitates real-time notifications for the support chat.
- WebSocket connections are used exclusively for notifications; message persistence is handled via the REST API.
- Targeted broadcast ensures notifications are sent only to relevant conversation participants.

### Data Storage Solutions

**Database:**
- PostgreSQL serves as the primary database, with Neon serverless PostgreSQL used for cloud deployment.
- Drizzle ORM provides type-safe queries and manages database migrations.

**Schema Design:**
- The database schema is comprehensive, covering Users, Roles, Products, Categories, Orders, Cart, Wishlist, Support Messages, Payment Cards, and Addresses.
- Features include UUID primary keys, timestamps, soft delete patterns, and optimized indexing.

### Business Logic

**Bonus System:**
- New users receive an initial bonus.
- Cashback rates are tiered based on order value.
- Bonuses are not combinable with promocodes.
- A maximum percentage of an order can be paid with bonuses.

**Promocode System:**
- Supports percentage-based discounts with configurable minimum/maximum order amounts.
- Includes expiration dates, usage limits, and active/inactive statuses.
- Promocode normalization to uppercase.

**Order Processing:**
- A multi-step checkout process includes address, delivery, payment, and confirmation.
- Integrations with delivery services for cost calculation.
- Supports multiple payment methods and order status tracking.

**Support Chat System:**
- Features a customer-facing widget with privacy consent (stored locally).
- An admin interface displays active conversations and customer information.
- Real-time message delivery is enabled via WebSocket notifications.
- A REST API handles message persistence with role-based access control.
- An auto-select feature for the first conversation in the admin interface.
- Includes a dedicated privacy policy page detailing the consent flow.

## Recent Changes

### 2024-11-23: Three-Tier Support Chat System Implementation

**Database Schema Updates:**
- ✅ Modified `supportConversations` table: changed `status` from boolean to enum ('open' | 'archived' | 'closed')
- ✅ Removed unique constraint on `userId` (allows multiple conversations per user across different statuses)
- ✅ Added `closedAt` timestamp field for tracking when chats are permanently closed
- ✅ Added `lastMessageAt` timestamp field for sorting conversations by recency
- ✅ Added `archivedAt` timestamp field for archival tracking

**Backend Storage Functions (server/storage.ts):**
- ✅ `getOrCreateConversation()`: Auto-reopens archived conversations when user sends message; creates new if closed
- ✅ `getActiveConversation()`: Returns active (open or archived) conversation for a user
- ✅ `getConversationStatus()`: Retrieves current status of user's conversation
- ✅ `archiveConversation()`: Transitions conversation from 'open' to 'archived'
- ✅ `closeConversation()`: Transitions conversation to 'closed' (permanent, complies with 152-ФЗ)
- ✅ `reopenConversation()`: Reopens archived conversations back to 'open' status
- ✅ `updateLastMessageTime()`: Updates lastMessageAt timestamp
- ✅ `searchClosedConversations()`: Full-text search of closed conversations by email/date range
- ✅ `getAllSupportConversations()`: Returns conversations filtered by status, sorted by lastMessageAt

**Backend API Endpoints (server/routes.ts):**
- ✅ `/api/support/conversations?status=open|archived|closed`: Fetch conversations by status (sorted by recency)
- ✅ `/api/support/conversations/:userId/archive`: Archive a conversation
- ✅ `/api/support/conversations/:userId/close`: Permanently close a conversation
- ✅ `/api/support/conversations/:userId/reopen`: Reopen an archived conversation
- ✅ `/api/support/conversation-status`: Get current chat status (customer endpoint)
- ✅ `/api/support/closed-search?email=X&dateFrom=Y&dateTo=Z`: Search closed conversations
- ✅ Removed `unreadCount` from conversation responses (not needed with 3-tier system)
- ✅ WebSocket notifications for conversation state changes

**Admin Panel (client/src/pages/admin/support-chat-page.tsx):**
- ✅ Added 3 tabs: "Открытые" (Open) | "Архив" (Archived) | "Закрытые" (Closed)
- ✅ Compacted UI: all sizes ~20% smaller, no page-level scrollbars
- ✅ Search interface for closed conversations (email + date range filters)
- ✅ Removed unread message counter from chat list
- ✅ Context-sensitive action buttons per status:
  - Open: Archive | Close buttons
  - Archived: Reopen | Close buttons
  - Closed: Display-only, no input area, "stored per 152-ФЗ" message
- ✅ Status change notifications via WebSocket

**Customer Chat Widget (client/src/components/support-chat-widget.tsx):**
- ✅ Fetches conversation status on load and every 5 seconds
- ✅ If status is 'closed': shows "Chat closed, start new" screen instead of messages
- ✅ Input area hidden for closed conversations
- ✅ Auto-hidden messages for closed chats (complies with Russian data retention law)
- ✅ Handles conversation_archived/conversation_closed WebSocket events

**Chat Launcher (client/src/components/support-chat-launcher.tsx):**
- ✅ Conditional rendering: button hidden when widget is open, widget hidden when button is shown
- ✅ Removed toggle logic in favor of separate open/close states
- ✅ Only visible to authenticated non-staff users

**Business Logic - Three-Tier Chat System:**
- **Open**: Active conversation, customer can message, admin can archive or close
- **Archived**: Resolved but reopenable; auto-reopens on customer's new message
- **Closed**: Permanent state; messages hidden from UI but stored in DB per 152-ФЗ (3-year retention)
- All status transitions tracked with timestamps
- Conversations sorted by lastMessageAt (most recent first)

### 2024-11-23: UI Improvements - Compact Design & Launcher UX Fix

**Admin Panel Compact Design (client/src/pages/admin/support-chat-page.tsx):**
- ✅ Reduced all sizes by ~20% for more efficient screen space usage:
  - CardHeader padding: `px-3 pt-3 pb-2` → `p-2` (12px → 8px)
  - CardTitle font: `text-base` → `text-sm` (16px → 14px)
  - All buttons: `h-7` → `h-6` (28px → 24px)
  - Button text: `text-xs` → `text-[11px]` (12px → 11px)
  - Icons: `h-3 w-3` → `h-2.5 w-2.5` (12px → 10px)
  - Conversation list rows: `p-2.5` → `p-2` (10px → 8px)
  - User ID/message text: `text-xs` → `text-[11px]`
  - Timestamps: `text-[10px]` → `text-[9px]`
  - Message bubbles: `px-3` → `px-2.5` (12px → 10px)
  - Input areas: `p-3` → `p-2` (12px → 8px)
  - Send button icon: `h-3 w-3` → `h-3.5 w-3.5`

**Status Filter Redesign:**
- ✅ Replaced horizontal 3-button layout with vertical Tabs component
- ✅ Imported `Tabs`, `TabsList`, `TabsTrigger` from Shadcn UI
- ✅ Vertical TabsList eliminates button overflow on small screens
- ✅ Maintains state binding to `statusFilter` ('open' | 'archived' | 'closed')
- ✅ Compact styling: `h-6`, `text-[11px]`, icons `h-2.5 w-2.5`

**Chat Launcher Button Visibility Fix (client/src/components/support-chat-launcher.tsx):**
- ✅ Implemented conditional rendering: `{!isOpen && <Button />}` and `{isOpen && <SupportChatWidget />}`
- ✅ Launcher button now completely disappears when chat widget is open
- ✅ Widget replaces button position, providing cleaner UX
- ✅ Close button in widget header allows users to dismiss chat and restore launcher button
- ✅ Removed `toggleChat()` function, simplified to direct `openChat()` call

### 2024-11-20: UX Improvements - Cart Badge, Quantity Controls & Fixed Positioning

**Cart Badge Positioning:**
- ✅ Moved cart badge closer to icon: changed from `-right-1.5 -top-1.5` to `-right-0 -top-0` (~6px closer)

**Product Card Quantity Controls:**
- ✅ Replaced static "В корзине: X из Y" text with interactive controls
- ✅ Added compact inline quantity editor with -, input field, + buttons
- ✅ Implemented free-form text input allowing users to delete all digits before typing
- ✅ Display shows: "в корзине [−] [input] [+] из [stock]" in one line
- ✅ Input validates against stock quantity on blur
- ✅ Enter key commits changes

**Cart Page Input Improvements:**
- ✅ Fixed quantity inputs to allow complete deletion of digits (resolved controlled input issue)
- ✅ Implemented local editing state that preserves user input during typing
- ✅ Added validation on blur to clamp values between 1 and stock quantity
- ✅ Enter key support for quick editing

**Support Chat Fixed Positioning:**
- ✅ Enhanced z-index from `z-50` to `!z-[9999]` for both launcher button and widget
- ✅ Added `!fixed` class to ensure positioning stays fixed to viewport (not page content)
- ✅ Chat button and widget now stay in bottom-right corner when scrolling

**Technical Implementation:**
- Modified 5 files: header.tsx, product-card.tsx, cart-page.tsx, support-chat-launcher.tsx, support-chat-widget.tsx
- Used local state pattern (string type) for inputs to enable free-form editing
- All inputs use `type="text"` with regex validation instead of `type="number"` for better UX

### 2024-11-20: Support Chat Widget - Full Implementation & Fixes

**Chat Widget Configuration:**
- ✅ Button size increased 1.5x: `h-11 w-11` (was h-7 w-7)
- ✅ Widget positioned bottom-left with `position: fixed` (stays in place when scrolling)
- ✅ Widget size reduced by 40%: width 252px, height 390px (was 420px × 650px)
- ✅ Only visible for authenticated customer role users (hidden from staff)

**Critical Bug Fixes:**
- ✅ **Fixed white screen crash**: apiRequest now returns parsed JSON instead of raw Response objects
- ✅ **Fixed duplicate messages**: Improved optimistic updates to prevent message duplication
- ✅ **Fixed real-time updates**: Admin panel now receives WebSocket notifications when customers send messages
- ✅ **Fixed TypeScript errors**: Added proper generic types to all mutation contexts
- ✅ **Added ErrorBoundary**: Prevents full application crashes when component errors occur

**Admin Panel Improvements:**
- ✅ Textarea height reduced by 50%: `rows={1}` (was rows={2})
- ✅ Send button size reduced by 50%: `h-10 w-10` (was h-auto with larger size)
- ✅ Real-time message delivery to all connected admins and consultants

**Technical Implementation:**
- Modified `apiRequest<T>()` in queryClient.ts to parse JSON responses
- Enhanced WebSocket broadcast logic to notify all staff members
- Updated connectedUsers Map to track user roles alongside connections
- Improved mutation onSuccess handlers to prevent duplicate message rendering
- All LSP diagnostics resolved

## External Dependencies

-   **Payment Integration:** YooKassa SDK
-   **Delivery Services:** CDEK API, Boxberry API
-   **Email Service:** Nodemailer (for transactional emails)
-   **Database Service:** Neon serverless PostgreSQL
-   **Development Tools:** Vite, Drizzle Kit, ESBuild