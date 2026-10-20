# ClothShop Inventory Management System (MERN)

A small clothing-shop management system (not an online store). Features:
- Dashboard summary
- Products/stock CRUD
- Billing / invoice creation
- Bill history and invoice details
- Worker CRUD
- Attendance records and monthly salary calculation
- Expenses CRUD
- Suppliers CRUD
- MongoDB persistence through Express + Mongoose
- Search, view, edit, delete actions in tables

## Requirements
- Node.js 18+
- MongoDB local installation OR MongoDB Atlas connection string

## 1. Configure backend
Open a terminal:
```bash
cd server
copy .env.example .env
```
Edit `server/.env` and set `MONGO_URI`. Example local MongoDB:
`MONGO_URI=mongodb://127.0.0.1:27017/clothshop_inventory`

## 2. Install and run backend
```bash
npm install
npm run dev
```
Backend: http://localhost:5000

## 3. Install and run frontend (new terminal)
```bash
cd client
npm install
npm run dev
```
Frontend: http://localhost:5173

## Notes
- Data is saved in MongoDB, not browser local storage.
- Bills save invoice line items and reduce stock for each sold product.
- Attendance is recorded by worker and date. Salary page calculates present days × daily salary.
- This starter app is intended for local development. Before live deployment, configure production environment variables, HTTPS, authentication/authorization, backups, and proper invoice/tax requirements.
