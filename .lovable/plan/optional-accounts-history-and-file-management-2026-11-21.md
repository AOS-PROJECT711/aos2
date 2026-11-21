# Optional accounts, history, and file management

Keep the current share-by-code experience available without signing in. Add optional email/password sign-up and sign-in, and show the signed-in user a private history of files they sent and codes they opened. Account owners can add files to or delete their own sent shares; removing a received code only removes it from that account's history, not the sender's file.

Add password recovery through a time-limited link sent to the user's email. A favorite-character answer is not secure enough to reset an account password, so it will not be used. Keep email confirmation enabled and do not add profile details.

## Technical details

- Add public sign-in, account-history, and password-reset screens; leave send, receive, classroom, and text access open to guests.
- Store received-code history with per-user access rules. Keep sent-share ownership in a server-only mapping, and require a verified signed-in session for listing, adding, or deleting owned files.
- Use the existing share-code path for guests; never allow a browser to claim or delete another user's files.
- Add focused tests and verify guest sharing, account-owned file changes, received-history removal, password recovery states, and mobile layout.