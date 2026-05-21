import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { UserPlus, Users, Shield, Loader2 } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}

const AdminPage = () => {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      toast.error("Erreur lors du chargement des utilisateurs", { description: err?.message });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Call the Supabase edge function to create user
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { email, password },
      });

      if (error) throw error;
      
      toast.success("Utilisateur créé avec succès");
      setEmail("");
      setPassword("");
      fetchUsers();
    } catch (err: any) {
      toast.error("Erreur lors de la création de l'utilisateur", { description: err?.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    try {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      
      if (error) throw error;
      
      toast.success(`Rôle changé en ${newRole}`);
      fetchUsers();
    } catch (err: any) {
      toast.error("Erreur lors du changement de rôle", { description: err?.message });
    }
  };

  // Load users on mount
  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <AppLayout title="Administration" subtitle="Gestion des utilisateurs et des rôles">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Create User Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Créer un nouvel utilisateur
            </CardTitle>
            <CardDescription>
              Ajoutez un nouvel utilisateur à la plateforme
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="utilisateur@exemple.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Au moins 6 caractères"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Création en cours...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Créer l'utilisateur
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Users List Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Utilisateurs
            </CardTitle>
            <CardDescription>
              Liste de tous les utilisateurs de la plateforme
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingUsers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Aucun utilisateur trouvé
              </p>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{u.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Créé le {new Date(u.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          u.role === 'admin'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        }`}
                      >
                        {u.role === 'admin' ? 'Admin' : 'Utilisateur'}
                      </span>
                      {u.id !== user?.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleRole(u.id, u.role)}
                        >
                          {u.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default AdminPage;
