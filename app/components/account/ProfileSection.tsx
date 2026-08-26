import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Loader2, User as UserIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { AppUser } from '@/app/data/types';
import type { useAuth } from '@/app/lib/auth/AuthContext';

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileSectionProps {
  user: AppUser;
  updateProfile: ReturnType<typeof useAuth>['updateProfile'];
  accountPrimaryEmail: string | null;
}

function ProfileSection({ user, updateProfile, accountPrimaryEmail }: ProfileSectionProps) {
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email ?? '',
    },
  });

  useEffect(() => {
    const primaryEmail = accountPrimaryEmail ?? user.email;
    profileForm.setValue('email', primaryEmail);
  }, [accountPrimaryEmail, profileForm, user]);

  const handleProfileSubmit = async (values: ProfileFormValues) => {
    setProfileError(null);
    setProfileSuccess(false);
    setProfileSubmitting(true);
    try {
      const result = await updateProfile(values);
      if (result.success) {
        setProfileSuccess(true);
      } else {
        setProfileError(result.error ?? 'Unable to update profile.');
      }
    } finally {
      setProfileSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserIcon className="h-5 w-5 text-primary" />
          <CardTitle>Profile</CardTitle>
        </div>
        <CardDescription>Update your name and email address.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={profileForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane" autoComplete="given-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={profileForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" autoComplete="family-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={profileForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {profileError && <p className="text-sm font-medium text-destructive">{profileError}</p>}
            {profileSuccess && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">
                <CheckCircle2 className="h-4 w-4" />
                Profile updated successfully.
              </p>
            )}
            <Button type="submit" className="mt-1 w-full gap-2 sm:w-auto" disabled={profileSubmitting}>
              {profileSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {profileSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default ProfileSection;
