# Publishing PDF Studio

The GitHub repository stores the application source. GitHub Pages cannot run
this app's Next.js API routes, Python backend, or native conversion programs.

## Keep conversions on this computer

Run `start-local.cmd` from the project directory. The app listens on
`http://127.0.0.1:3000`. This address works only on this computer.

After the local app is running, double-click `share-public.cmd` to create a
temporary public HTTPS URL through Cloudflare Tunnel. It downloads a pinned,
checksum-verified tunnel client into the ignored `.runtime` folder. The URL is
printed in the terminal and saved in `.runtime/tunnel.json`. Anyone with the URL
can use the app. Traffic passes through Cloudflare; conversion processing stays
on this computer. Keep the computer awake and connected.

Use `stop-public.cmd` to stop public access while leaving the local app running.
Starting a new tunnel generates a different URL. Quick Tunnels are for testing,
not permanent hosting, and have no uptime guarantee. A permanent address needs
a configured named tunnel and domain. See the
[Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

Do not publish Windows binaries, licenses, temporary uploads, or `.env` files
to GitHub.

## Host on a server

The included Dockerfile builds the Next.js application and installs Python,
LibreOffice, FFmpeg, Calibre, Ghostscript, and OCR dependencies. A Docker-capable
web host can build it directly from the repository and expose port 3000 through
HTTPS. The application also honors the host's `PORT` environment variable.

On a machine with Docker installed:

```sh
docker compose up --build -d
```

This Compose configuration binds to localhost. Place an HTTPS reverse proxy in
front of it for public hosting. The Docker build has not been verified on the
current Windows computer because Docker is not installed here.

Hosting moves uploaded documents to the selected server for processing; no
CloudConvert API is used. This differs from keeping files on this computer.
Choose the hosting account and plan before creating a service.

## Conversion availability

Availability is detected from the engines installed on the deployment machine.
The expanded Windows setup is not bundled into the Linux Docker image. In
particular, the image does not currently install RAR creation, native 7-Zip,
or ImageMagick. Some LibreOffice export filters also vary by version. Do not
assume the local Windows format count applies to a server deployment.

After deployment, verify `/api/health`, `/api/convert`, and a real upload,
conversion, and download for each required category. Conversion files are
temporary; saved workflows and favorites are browser-local.
