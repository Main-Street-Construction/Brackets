export function formatFirebaseError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
      return 'Permission denied. Sign in with Google as the tournament creator to edit.';
    }
    if (message.includes('index')) {
      return 'Firestore index is still building. Try again in a minute.';
    }
    if (message.includes('invalid-api-key')) {
      return 'Invalid Firebase API key. Check Vercel env vars.';
    }
    return message;
  }
  return 'Something went wrong. Please try again.';
}
