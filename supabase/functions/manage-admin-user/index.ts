import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// Busca un usuario en Auth por email recorriendo TODAS las páginas.
// listUsers() por defecto solo devuelve la primera página (50 usuarios),
// así que con miles de usuarios registrados los administradores no se
// encontraban y la función respondía "Usuario no encontrado en Auth".
async function findAuthUserByEmail(adminClient: SupabaseClient, email: string) {
  const target = (email || '').toLowerCase().trim();
  if (!target) return null;

  const perPage = 1000;
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find(
      (u: { email?: string }) => (u.email || '').toLowerCase().trim() === target
    );
    if (found) return found;

    // Última página alcanzada, no hay más usuarios que revisar.
    if (users.length < perPage) return null;
    page++;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    });
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  try {
    // Verify JWT from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey, {
      db: { schema: 'aulacaeduc' }
    });

    const body = await req.json();
    const { action, email, password, name, role, id, active, new_password } = body;

    if (action === 'create') {
      // Create auth user
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authErr) return new Response(JSON.stringify({ error: authErr.message }), { status: 400, headers });

      // Insert into cpg_admin_users
      const { error: dbErr } = await adminClient
        .schema('aulacaeduc')
        .from('cpg_admin_users')
        .insert({ email, name: name || '', role: role || 'admin', active: true });
      if (dbErr) return new Response(JSON.stringify({ error: dbErr.message }), { status: 400, headers });

      return new Response(JSON.stringify({ success: true, user: authUser.user }), { headers });
    }

    if (action === 'update') {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (role !== undefined) updates.role = role;
      if (active !== undefined) updates.active = active;
      updates.updated_at = new Date().toISOString();

      const { error: dbErr } = await adminClient
        .schema('aulacaeduc')
        .from('cpg_admin_users')
        .update(updates)
        .eq('id', id);
      if (dbErr) return new Response(JSON.stringify({ error: dbErr.message }), { status: 400, headers });

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'delete') {
      // Get the user email first
      const { data: adminUser } = await adminClient
        .schema('aulacaeduc')
        .from('cpg_admin_users')
        .select('email')
        .eq('id', id)
        .single();

      if (adminUser?.email) {
        // Find and delete auth user
        const authUser = await findAuthUserByEmail(adminClient, adminUser.email);
        if (authUser) {
          await adminClient.auth.admin.deleteUser(authUser.id);
        }
      }

      const { error: dbErr } = await adminClient
        .schema('aulacaeduc')
        .from('cpg_admin_users')
        .delete()
        .eq('id', id);
      if (dbErr) return new Response(JSON.stringify({ error: dbErr.message }), { status: 400, headers });

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (action === 'reset_password') {
      const authUser = await findAuthUserByEmail(adminClient, email);
      if (!authUser) return new Response(JSON.stringify({ error: 'Usuario no encontrado en Auth' }), { status: 404, headers });

      const { error: pwErr } = await adminClient.auth.admin.updateUserById(authUser.id, { password: new_password });
      if (pwErr) return new Response(JSON.stringify({ error: pwErr.message }), { status: 400, headers });

      return new Response(JSON.stringify({ success: true }), { headers });
    }

    return new Response(JSON.stringify({ error: 'Acción no reconocida' }), { status: 400, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
});
