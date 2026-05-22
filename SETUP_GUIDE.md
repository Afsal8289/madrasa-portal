# Madrasa Portal - Setup & Usage Guide

## ⚙️ Initial Setup Instructions

### Step 1: Create Super Admin Account in Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **madrasa-portal-63037**
3. Navigate to **Authentication** → **Users**
4. Click **Add User** button
5. Enter the following credentials:
   - **Email:** `superadmin@madrasa.com`
   - **Password:** (Create a strong password, e.g., `SuperAdmin@123`)
6. Click **Add User**

### Step 2: Enable Realtime Database

1. In Firebase Console, go to **Realtime Database**
2. Click **Create Database**
3. Choose location: **Asia Southeast (Singapore)** or nearest to you
4. Select **Start in test mode** (for development)
5. Click **Enable**

### Step 3: Update Firebase Rules (Security)

1. Go to **Realtime Database** → **Rules** tab
2. Replace the default rules with:

```json
{
  "rules": {
    "madrasas": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

3. Click **Publish**

---

## 🚀 How to Use

### For Super Admin:

1. **Login:**
   - Open `index.html`
   - Email: `superadmin@madrasa.com`
   - Password: (The password you set)
   - Click **Login**
   - You'll be redirected to the Super Admin Dashboard

2. **Add New Madrasa:**
   - Fill in:
     - **Madrasa Name:** (e.g., Al-Noor Madrasa)
     - **Admin Email:** (e.g., admin@alnoor.com)
     - **Password:** (Create password for madrasa admin)
     - **Expiry Date:** (Optional - can be set later)
   - Click **Create Account**

3. **View All Madrasas:**
   - The table shows all registered madrasas
   - **Status** shows "Active" (Green) or "Expired" (Red)

4. **Renew Single Madrasa:**
   - Click **Renew** button next to the madrasa
   - Enter new expiry date in format: `YYYY-MM-DD`
   - Click OK

5. **Delete Madrasa:**
   - Click **Delete** button next to the madrasa
   - Confirm deletion

6. **Update All Madrasas Expiry:**
   - Enter date in "New Global Expiry Date" field
   - Click **Update All Madrasas**
   - Confirm the action

7. **Logout:**
   - Click **Logout** button in the top-right corner

---

## 📊 Database Structure

Madrasas are stored in Firebase Realtime Database with the following structure:

```
madrasas/
  ├── admin_alnoor_com/
  │   ├── name: "Al-Noor Madrasa"
  │   ├── email: "admin@alnoor.com"
  │   ├── createdDate: "2026-05-11T10:30:00Z"
  │   ├── expiryDate: "2026-12-31"
  │   └── status: "active"
  │
  └── admin_noor_com/
      ├── name: "Noor Academy"
      ├── email: "admin@noor.com"
      ├── createdDate: "2026-05-11T11:00:00Z"
      ├── expiryDate: "2027-06-30"
      └── status: "active"
```

---

## 🔐 Security Notes

- **Keep super admin credentials safe** - Only share with trusted administrators
- **Change default rules** - Update Firebase rules before going to production
- **Use strong passwords** - Enforce strong password policies for all madrasas
- **Regular backups** - Regularly export your database

---

## 🐛 Troubleshooting

### Problem: "Unauthorized Access! Please login as Super Admin"
- **Solution:** Make sure you're using the correct super admin credentials
- Email must be exactly: `superadmin@madrasa.com`

### Problem: "Error creating madrasa"
- **Solution:** 
  - Check if all required fields are filled
  - Verify Firebase Realtime Database is enabled
  - Check Firebase rules allow write access

### Problem: Logout not working
- **Solution:** Clear browser cache and reload the page

### Problem: Data not loading in table
- **Solution:**
  - Check Firebase database URL in code
  - Verify Firebase rules allow read access
  - Open browser console (F12) to check errors

---

## 📁 File Structure

```
madrasa portal/
├── index.html           → Login page
├── super_admin.html     → Super Admin Dashboard
├── app.js               → Login logic & authentication
├── style.css            → Styling for login page
└── SETUP_GUIDE.md       → This file
```

---

## 🔗 Useful Links

- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Realtime Database Docs](https://firebase.google.com/docs/database)
- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)

---

## ❓ FAQ

**Q: Can I change the super admin email?**
A: Yes, modify the email check in `app.js` line 28: `if(email === "superadmin@madrasa.com")`

**Q: How long are madrasas valid by default?**
A: Default is set to 2099-12-31 (very long), but you can change it during creation or renewal

**Q: Can multiple super admins exist?**
A: Currently, only one email is configured. To add more, create additional user accounts in Firebase Authentication and update the email check in `app.js`

**Q: Where are madrasa passwords stored?**
A: Currently not stored in the database. Implement proper user management by creating separate Firebase Auth users for each madrasa admin.

---

**Last Updated:** May 11, 2026
**Version:** 1.0
