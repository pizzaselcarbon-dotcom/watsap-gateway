# WhatsApp por QR para Comidas Rápidas el CARBÓN

Este servicio conecta el WhatsApp del negocio (como WhatsApp Web) con tu bot (`api/bot.js`) y con el POS.
Reemplaza a AutoResponder.ai: el celular ya no tiene que estar prendido ni con la app abierta.

## 1. Subirlo a un servidor (Railway, unos 5 USD/mes)
1. Crea un repositorio nuevo en GitHub, por ejemplo `wa-gateway`, y sube TODOS los archivos de esta carpeta (menos `node_modules`).
2. Entra a https://railway.app → **New Project** → **Deploy from GitHub repo** → elige `wa-gateway`.
3. En el servicio, pestaña **Variables**, agrega:
   - `FIREBASE_SERVICE_ACCOUNT` → el mismo JSON que tienes en Vercel.
   - `BOT_URL` → `https://comd-rap-el-carbon-menu.vercel.app`
   - `BOT_SECRET` → el mismo BOT_SECRET que tienes en Vercel.
   - `GW_KEY` → una clave larga que te inventes (la usarás en el POS). Ej.: 30 letras y números.
   - (opcional) `HANDOFF_MIN` → minutos que el bot se calla cuando alguien del negocio escribe desde el celular (por defecto 15; 0 = nunca se calla).
4. Pestaña **Settings → Networking → Generate Domain**. Anota la dirección (ej. `https://wa-gateway-production.up.railway.app`).
5. Espera a que diga **Active/Deployed**.

## 2. Vincular el WhatsApp
1. Abre `https://TU-DIRECCION/qr?key=TU_GW_KEY` (o desde el POS: Ajustes → Conexión directa de WhatsApp → «Abrir pantalla del QR»).
2. En el celular del negocio: WhatsApp → **Dispositivos vinculados → Vincular un dispositivo** y escanea el código.
3. La página debe decir «✅ WhatsApp conectado».
4. **Apaga AutoResponder.ai** (o desactiva sus respuestas); si no, el cliente recibiría dos respuestas.

## 3. Conectarlo al POS
POS → Ajustes → **Conexión directa de WhatsApp**: pon la dirección y la clave (`GW_KEY`) y toca «Probar conexión».
Desde ahí, «💬 Mensaje», «Responder» y los mensajes rápidos se envían solos, sin abrir WhatsApp.

## Cosas a saber
- El celular debe abrir WhatsApp al menos una vez cada ~2 semanas, o WhatsApp desvincula los dispositivos.
- Si desvinculas desde el celular, el servicio se reinicia y muestra un QR nuevo.
- Fotos, audios y archivos del cliente se ven en el POS como «[imagen]» etc.; el bot no responde a ellos.
- Si alguien del negocio escribe desde el celular, el bot se calla ese chat durante `HANDOFF_MIN` minutos.
- Es una conexión no oficial de WhatsApp Web: con pocos mensajes al día el riesgo de bloqueo es bajo, pero no es cero.
- La sesión se guarda en Firestore (`wa_auth`), así que sobrevive a reinicios y despliegues.
- Pruebas internas: `npm install && npm test`.
