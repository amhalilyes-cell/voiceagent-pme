// Types Vapi pour les événements webhook et les appels

export type VapiCallStatus =
  | "queued"
  | "ringing"
  | "in-progress"
  | "forwarding"
  | "ended";

export type VapiEndedReason =
  | "assistant-ended-call"
  | "customer-ended-call"
  | "assistant-forwarded-call"
  | "voicemail"
  | "max-duration-exceeded"
  | "pipeline-error"
  | "silence-timed-out";

export interface VapiCaller {
  number?: string;       // champ réel envoyé par Vapi
  phoneNumber?: string;  // alias de compatibilité
  name?: string;
}

export interface VapiMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  time?: number;
  name?: string; // nom de la fonction pour role="tool"
}

export interface VapiCall {
  id: string;
  orgId: string;
  assistantId: string;
  status: VapiCallStatus;
  phoneNumber?: {
    id: string;
    number: string;
  };
  customer?: VapiCaller;
  startedAt?: string;
  endedAt?: string;
  endedReason?: VapiEndedReason;
  transcript?: string;
  messages?: VapiMessage[];
  summary?: string;
  recordingUrl?: string;
  cost?: number;
  costBreakdown?: {
    transport?: number;
    stt?: number;
    llm?: number;
    tts?: number;
    vapi?: number;
  };
}

// --- Webhook event types ---

export type VapiWebhookType =
  | "call-started"
  | "call-ended"
  | "transcript"
  | "function-call"
  | "end-of-call-report"
  | "hang"
  | "speech-update"
  | "status-update"
  | "tool-calls";

export interface VapiWebhookBase {
  message: {
    type: VapiWebhookType;
    call: VapiCall;
    timestamp?: string;
  };
}

export interface VapiCallStartedEvent extends VapiWebhookBase {
  message: VapiWebhookBase["message"] & {
    type: "call-started";
  };
}

export interface VapiCallEndedEvent extends VapiWebhookBase {
  message: VapiWebhookBase["message"] & {
    type: "call-ended";
    endedReason: VapiEndedReason;
  };
}

export interface VapiTranscriptEvent extends VapiWebhookBase {
  message: VapiWebhookBase["message"] & {
    type: "transcript";
    role: "user" | "assistant";
    transcriptType: "partial" | "final";
    transcript: string;
  };
}

export interface VapiFunctionCallEvent extends VapiWebhookBase {
  message: VapiWebhookBase["message"] & {
    type: "function-call";
    functionCall: {
      name: string;
      parameters: Record<string, unknown>;
    };
  };
}

export interface VapiEndOfCallReportEvent extends VapiWebhookBase {
  message: VapiWebhookBase["message"] & {
    type: "end-of-call-report";
    endedReason: VapiEndedReason;
    transcript: string;
    summary: string;
    messages: VapiMessage[];
    recordingUrl?: string;
    durationSeconds?: number; // fourni directement par Vapi
  };
}

export type VapiWebhookEvent =
  | VapiCallStartedEvent
  | VapiCallEndedEvent
  | VapiTranscriptEvent
  | VapiFunctionCallEvent
  | VapiEndOfCallReportEvent;

// --- Réponse à un function-call ---
export interface VapiFunctionCallResponse {
  result: string;
}
