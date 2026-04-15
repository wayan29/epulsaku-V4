// src/app/(app)/account/login-activity/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getLoginHistory, type LoginActivity, deleteLoginActivityEntry } from '@/lib/user-utils';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldAlert, Server, Network, CalendarClock, Trash2, AlertTriangle } from "lucide-react";
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { formatDateInTimezone } from '@/lib/timezone';

export default function LoginActivityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loginActivities, setLoginActivities] = useState<LoginActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const themedCardClass =
    "w-full border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";
  const themedMutedTextClass = "text-[var(--ui-text-muted)] dark:text-zinc-400";
  const themedOutlineButtonClass =
    "rounded-xl border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] hover:bg-[var(--ui-accent-bg)] hover:text-[var(--ui-accent)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100";

  const fetchActivities = useCallback(async () => {
    if (user?.username) {
      setIsLoading(true);
      setError(null);
      try {
        const activities = await getLoginHistory(user.username);
        setLoginActivities(activities);
      } catch (err) {
        setError("Failed to load login activity. Please try again later.");
        console.error("Error fetching login activity:", err);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
      setError("User not logged in."); 
    }
  }, [user?.username]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleDeleteActivity = async () => {
    if (!selectedActivityId) return;
    setIsDeleting(true);
    const result = await deleteLoginActivityEntry(selectedActivityId);
    if (result.success) {
      toast({ title: "Activity Deleted", description: "The login activity record has been removed." });
      fetchActivities(); // Refresh the list
    } else {
      toast({ title: "Deletion Failed", description: result.message || "Could not delete the activity record.", variant: "destructive" });
    }
    setIsDeleting(false);
    setIsConfirmingDelete(false);
    setSelectedActivityId(null);
  };
  
  return (
    <>
      <div className="p-0 mb-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <ShieldAlert className="h-7 w-7 text-[var(--ui-accent)]" />
          <h2 className="text-xl font-semibold font-headline text-[var(--ui-text)] dark:text-zinc-100">Login Activity</h2>
        </div>
        <p className={`text-sm ${themedMutedTextClass}`}>
          Review recent login activity for your account. The &apos;Device / Browser&apos; (User Agent) and &apos;IP Address&apos;
          columns help you identify the devices and approximate locations. If you see any suspicious activity, please change your password immediately.
        </p>
      </div>
      <Card className={themedCardClass}>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--ui-accent)]" />
              <p className={`ml-2 ${themedMutedTextClass}`}>Loading activity...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-center text-destructive">
              {error}
            </div>
          ) : loginActivities.length === 0 ? (
            <p className={`${themedMutedTextClass} text-center py-6`}>No login activity found for your account.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[var(--ui-border)] dark:border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--ui-border)] bg-[var(--ui-card-alt)] hover:bg-[var(--ui-card-alt)] dark:border-zinc-800 dark:bg-zinc-900">
                    <TableHead className="min-w-[180px] text-[var(--ui-text)] dark:text-zinc-100"><CalendarClock className={`inline-block mr-1 h-4 w-4 ${themedMutedTextClass}`} />Date & Time</TableHead>
                    <TableHead className="min-w-[250px] text-[var(--ui-text)] dark:text-zinc-100"><Server className={`inline-block mr-1 h-4 w-4 ${themedMutedTextClass}`} />Device / Browser</TableHead>
                    <TableHead className="min-w-[150px] text-[var(--ui-text)] dark:text-zinc-100"><Network className={`inline-block mr-1 h-4 w-4 ${themedMutedTextClass}`} />IP Address</TableHead>
                    <TableHead className="text-right min-w-[80px] text-[var(--ui-text)] dark:text-zinc-100">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loginActivities.map((activity) => (
                    <TableRow key={activity._id?.toString() || activity.loginTimestamp.toString() + activity.ipAddress} className="border-[var(--ui-border)] hover:bg-[var(--ui-accent-bg)] dark:border-zinc-800">
                      <TableCell className="text-[var(--ui-text)] dark:text-zinc-100">{formatDateInTimezone(activity.loginTimestamp)}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-[var(--ui-text)] dark:text-zinc-100" title={activity.userAgent || 'N/A'}>
                        {activity.userAgent || 'N/A'}
                      </TableCell>
                      <TableCell className={themedMutedTextClass}>{activity.ipAddress || 'N/A'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedActivityId(activity._id || null);
                            setIsConfirmingDelete(true);
                          }}
                          disabled={!activity._id || isDeleting}
                          title="Delete this login record"
                          className="text-[var(--ui-text)] hover:bg-destructive/10 dark:text-zinc-100"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                          <span className="sr-only">Delete login record</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isConfirmingDelete} onOpenChange={setIsConfirmingDelete}>
        <AlertDialogContent className="border-[var(--ui-border)] bg-[var(--ui-card)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[var(--ui-text)] dark:text-zinc-100">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              Confirm Deletion
            </AlertDialogTitle>
            <AlertDialogDescription className={themedMutedTextClass}>
              Are you sure you want to delete this login activity record? This action cannot be undone and only removes the record, it does not log out the session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className={themedOutlineButtonClass}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteActivity}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
