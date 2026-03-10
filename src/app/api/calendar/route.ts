import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// Initialise le client Google OAuth2
function getGoogleCalendarClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.calendar({ version: "v3", auth });
}

// POST /api/calendar — appelé par Vapi tool call
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Vapi envoie les arguments de l'outil ici
    const {
      clientName,
      clientPhone,
      serviceType,
      date,        // format: "2024-03-15"
      time,        // format: "14:00"
      duration = 60, // durée en minutes, défaut 1h
    } = body;

    if (!clientName || !date || !time) {
      return NextResponse.json(
        { error: "Paramètres manquants: clientName, date, time requis" },
        { status: 400 }
      );
    }

    const calendar = getGoogleCalendarClient();

    // Construit les dates de début et fin
    const startDateTime = new Date(`${date}T${time}:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    // Crée l'événement dans Google Calendar
    const event = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      requestBody: {
        summary: `RDV ${serviceType || "Intervention"} - ${clientName}`,
        description: `Client: ${clientName}\nTéléphone: ${clientPhone || "Non renseigné"}\nService: ${serviceType || "Non précisé"}\n\nRDV pris via assistant vocal VoiceAgent PME`,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: "Europe/Paris",
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: "Europe/Paris",
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 60 },
            { method: "popup", minutes: 30 },
          ],
        },
      },
    });

    return NextResponse.json({
      success: true,
      eventId: event.data.id,
      message: `RDV confirmé pour ${clientName} le ${date} à ${time}`,
      eventLink: event.data.htmlLink,
    });

  } catch (error: unknown) {
    console.error("Erreur Google Calendar:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json(
      { error: "Impossible de créer le RDV", details: message },
      { status: 500 }
    );
  }
}

// GET /api/calendar/slots — récupère les créneaux disponibles
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // format: "2024-03-15"

    if (!date) {
      return NextResponse.json({ error: "Paramètre date requis" }, { status: 400 });
    }

    const calendar = getGoogleCalendarClient();

    // Récupère les événements du jour
    const startOfDay = new Date(`${date}T07:00:00`);
    const endOfDay = new Date(`${date}T19:00:00`);

    const events = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const busySlots = (events.data.items || []).map((event) => ({
      start: event.start?.dateTime,
      end: event.end?.dateTime,
    }));

    // Génère les créneaux libres (toutes les heures de 8h à 18h)
    const allSlots = [];
    for (let hour = 8; hour <= 17; hour++) {
      const slotStart = new Date(`${date}T${hour.toString().padStart(2, "0")}:00:00`);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60000);

      const isBusy = busySlots.some((busy) => {
        const busyStart = new Date(busy.start || "");
        const busyEnd = new Date(busy.end || "");
        return slotStart < busyEnd && slotEnd > busyStart;
      });

      if (!isBusy) {
        allSlots.push(`${hour.toString().padStart(2, "0")}:00`);
      }
    }

    return NextResponse.json({ date, availableSlots: allSlots });

  } catch (error: unknown) {
    console.error("Erreur Google Calendar:", error);
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    return NextResponse.json(
      { error: "Impossible de récupérer les créneaux", details: message },
      { status: 500 }
    );
  }
}
