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

### 2024-11-20: Support Chat Widget & Critical Bug Fixes

**Support Chat Widget Enabled:**
- Chat widget is now active and visible for authenticated regular users (customer role)
- Widget positioned in bottom-left corner with reduced button size (h-7 w-7)
- Staff users (admin, marketer, consultant) do not see the widget

**Critical Bug Fixes:**
- **Fixed white screen crash**: apiRequest now properly returns parsed JSON instead of raw Response objects
- **Fixed TypeScript errors**: Added proper generic types to useMutation contexts
- **Added ErrorBoundary**: Prevents full application crashes when component errors occur
- **Fixed mutation types**: All support chat mutations now have proper context typing

**Technical Details:**
- Modified `apiRequest<T>()` in queryClient.ts to parse JSON responses
- Updated support chat mutations in both user widget and admin panel
- Added ErrorBoundary component wrapping Router and SupportChatLauncher
- All LSP diagnostics resolved

## External Dependencies

-   **Payment Integration:** YooKassa SDK
-   **Delivery Services:** CDEK API, Boxberry API
-   **Email Service:** Nodemailer (for transactional emails)
-   **Database Service:** Neon serverless PostgreSQL
-   **Development Tools:** Vite, Drizzle Kit, ESBuild