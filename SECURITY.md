# Security policy

## Report a vulnerability

Report it in private through GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**. Do not open a public issue.

Include the steps to reproduce the problem and what an attacker could do with it.

## What Ferry protects

- File contents, file names and text are encrypted on the sending device and decrypted on the receiving device. The server and any relay see only ciphertext.
- A guest that joins with the full link is authenticated by the link secret, which the server never receives.
- A guest that joins with the 6-digit code is admitted only after the host confirms the security code shown on both screens.

## What Ferry does not protect

- Anyone who has the full link can join the transfer while it is open. Treat the link like the files themselves.
- A direct connection shows each device the other's IP address.
- Ferry cannot protect a device that is already compromised, or files after they are saved.
- If the host admits a guest without comparing the security codes, an attacker who controls the server could take the guest's place.

## In scope

- A way for the server, a relay or a network attacker to read or change transferred data.
- A way to join a transfer without the link, the code or the host's approval.
- A way for one device to act as another.
- A way to read the admin page without the password.

## Out of scope

- Attacks that need a compromised browser or operating system.
- Denial of service by sending many requests.
- Reports from automated scanners with no working proof.
