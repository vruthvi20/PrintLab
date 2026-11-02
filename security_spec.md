# Security Specification for PrintLab STEAM Lab

## 1. Data Invariants
1. Students submit print requests without requiring Firebase Auth account; their request is secured and tracked by their unique random `trackingCode` (e.g. `PL-4F7K2`).
2. Students can view requests matching their tracking codes or submitted by their email, and can update their own request only if it is in `needs_changes` status to provide a revised file.
3. Only authenticated administrators registered in the `admins` collection can read all requests, approve/reject/reschedule bookings, modify printer status, edit settings, manage filaments, and invite new admins.
4. The first admin bootstrap is permitted when the `admins` collection has zero members or during initial setup by the designated lab owner.
5. Printer status and bookings are publicly readable so all students can see live availability, queue status, and the next free printing slot.
6. Bookings strictly cannot overlap.
7. Admin invitations have high-entropy tokens and can only be created by authenticated admins.
8. Storage uploads are constrained to 50MB and valid 3D file extensions (.stl, .obj, .3mf).

## 2. Dirty Dozen Security Payloads
1. Unauthenticated client attempting to delete another student's request -> PERMISSION_DENIED.
2. Unauthenticated client attempting to update a request that is already `approved` or `printing` -> PERMISSION_DENIED.
3. Unauthenticated client attempting to change the status of a request from `pending` to `approved` -> PERMISSION_DENIED.
4. Non-admin attempting to write to `bookings` -> PERMISSION_DENIED.
5. Non-admin attempting to set `printerStatus` to offline or change maintenance notes -> PERMISSION_DENIED.
6. Non-admin attempting to add themselves to `/admins/{uid}` -> PERMISSION_DENIED.
7. Attacker attempting to inject a 10MB string into `projectTitle` -> PERMISSION_DENIED.
8. Attacker attempting to create an admin invitation token without an active admin session -> PERMISSION_DENIED.
9. Attacker attempting to modify `settings/filaments` or reset inventory -> PERMISSION_DENIED.
10. Attacker attempting to wipe `/activityLogs` -> PERMISSION_DENIED.
11. Malicious user attempting to upload a 60MB executable file (.exe) to Firebase Storage -> PERMISSION_DENIED.
12. Attacker querying all requests across the entire school without admin credentials -> PERMISSION_DENIED.
