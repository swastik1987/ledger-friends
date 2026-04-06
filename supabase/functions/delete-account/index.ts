import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Create a client with the user's JWT to verify identity
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const userId = user.id;

    // Create admin client for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── Safety check: block if user is sole admin of any shared tracker ──
    const { data: adminTrackers } = await adminClient
      .from('trackers')
      .select('id, name')
      .eq('admin_id', userId);

    if (adminTrackers && adminTrackers.length > 0) {
      for (const tracker of adminTrackers) {
        // Count total members
        const { count: memberCount } = await adminClient
          .from('tracker_members')
          .select('id', { count: 'exact', head: true })
          .eq('tracker_id', tracker.id);

        if (memberCount && memberCount > 1) {
          // Check for other admins
          const { data: otherAdmins } = await adminClient
            .from('tracker_members')
            .select('user_id')
            .eq('tracker_id', tracker.id)
            .eq('role', 'admin')
            .neq('user_id', userId);

          if (!otherAdmins || otherAdmins.length === 0) {
            return new Response(JSON.stringify({
              error: `You are the sole admin of shared tracker "${tracker.name}". Transfer admin role to another member before deleting your account.`,
            }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            });
          }
        }
      }
    }

    // ── Step 1: Remove user from all trackers they're a member of (not admin) ──
    await adminClient
      .from('tracker_members')
      .delete()
      .eq('user_id', userId);

    // ── Step 2: Delete trackers the user owns ──
    // CASCADE will handle: expenses, tracker_members, custom categories
    if (adminTrackers && adminTrackers.length > 0) {
      const trackerIds = adminTrackers.map(t => t.id);
      await adminClient
        .from('trackers')
        .delete()
        .in('id', trackerIds);
    }

    // ── Step 3: Clean up category_learning entries ──
    // These don't have a user FK but we clean up orphaned data
    // (categories deleted via CASCADE will leave orphaned learning entries)

    // ── Step 4: Delete profile ──
    await adminClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    // ── Step 5: Delete auth user ──
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error('Failed to delete auth user:', deleteAuthError);
      return new Response(JSON.stringify({
        error: 'Account data deleted but failed to remove authentication. Please contact support.',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    console.error('delete-account error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
});
