# Admin User System Setup

This document explains how to set up and use the admin user system in the Excel Quality Suite.

## Overview

The system has two types of users:
- **Admin users**: Can create new users and manage user roles
- **Normal users**: Regular users with access to the application features

## Setup Instructions

### 1. Run the Database Migration

Apply the migration to create the `profiles` table with role support:

```bash
# Using Supabase CLI
supabase db push

# Or apply manually in Supabase dashboard:
# Go to SQL Editor and run the contents of:
# supabase/migrations/001_create_profiles_with_roles.sql
```

### 2. Deploy the Edge Function

Deploy the `create-user` edge function to Supabase:

```bash
# Using Supabase CLI
supabase functions deploy create-user

# Make sure to set the SUPABASE_SERVICE_ROLE_KEY environment variable
# in your Supabase project settings
```

### 3. Set Your First Admin User

Since public signup is disabled, you need to manually create the first admin user:

**Option A: Using Supabase Dashboard**
1. Go to Supabase Dashboard → Authentication
2. Click "Add user" → "Create new user"
3. Enter email and password
4. After creation, go to SQL Editor
5. Run this SQL to make them an admin:

```sql
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

**Option B: Using SQL directly**
```sql
-- First create the user via auth
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
VALUES (
  'your-email@example.com',
  crypt('your-password', gen_salt('bf')),
  now()
);

-- Then create the profile with admin role
INSERT INTO public.profiles (id, email, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'your-email@example.com'),
  'your-email@example.com',
  'admin'
);
```

### 4. Access the Admin Panel

Once you have an admin account:
1. Log in with your admin credentials
2. You'll see an "Administration" link in the sidebar (only visible to admins)
3. Navigate to `/admin` to access the admin panel
4. From there, you can:
   - Create new users
   - Promote/demote users between admin and regular roles
   - View all users in the system

## How to Promote a User to Admin

To change a user's role to admin:

**Via Admin Panel:**
1. Go to the Administration page
2. Find the user in the list
3. Click "Promote" next to their name

**Via SQL:**
```sql
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'user-email@example.com';
```

## Security Notes

- Public signup is disabled - only admins can create new users
- The edge function verifies that the requester is an admin before creating users
- Row Level Security (RLS) is enabled on the profiles table
- Admins can view and manage all user profiles
- Regular users can only view their own profile

## Edge Function Environment Variables

Make sure the following environment variable is set in your Supabase project:
- `SUPABASE_SERVICE_ROLE_KEY`: Required for the edge function to create users

## Troubleshooting

**Issue: Can't see the Administration link**
- Make sure your user has the 'admin' role in the profiles table
- Try logging out and back in to refresh the session

**Issue: Edge function returns "Only admins can create users"**
- Verify your user's role is set to 'admin' in the profiles table
- Check that the edge function is deployed correctly

**Issue: Migration fails**
- Make sure you have the necessary permissions in Supabase
- Check that the migration file syntax is correct
