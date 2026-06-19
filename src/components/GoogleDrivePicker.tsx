"use client";
// Google Drive file picker. Loads Google's Picker JS on demand and opens the
// standard Drive chooser scoped to presentations (native Google Slides + .pptx).
//
// With the `drive.file` OAuth scope, the Picker is the privacy-preserving way to
// get at existing files: whatever the teacher selects here becomes accessible to
// the app — we never list or read their whole Drive.
//
// Needs a browser API key (NEXT_PUBLIC_GOOGLE_API_KEY) and the live OAuth token
// (resolved from google_tokens via google.getAccessToken).

import { google, PICKER_MIME_TYPES } from "@/lib/google";

declare global {
  interface Window { gapi?: any; google?: any }
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_APP_ID; // cloud project number (optional)

export interface DrivePick { id: string; name: string; mimeType?: string }

let pickerReady: Promise<void> | null = null;
function loadPicker(): Promise<void> {
  if (typeof window !== "undefined" && window.google?.picker) return Promise.resolve();
  if (pickerReady) return pickerReady;
  pickerReady = new Promise<void>((resolve, reject) => {
    const start = () => window.gapi.load("picker", { callback: () => resolve(), onerror: reject });
    if (window.gapi) return start();
    const s = document.createElement("script");
    s.src = "https://apis.google.com/js/api.js";
    s.async = true; s.defer = true;
    s.onload = start;
    s.onerror = () => reject(new Error("Couldn't load the Google Picker."));
    document.body.appendChild(s);
  });
  return pickerReady;
}

/**
 * Opens the Drive picker. Resolves with the chosen file, or null if the teacher
 * cancels. Throws if Google isn't connected or the Picker can't load.
 */
export async function openDrivePicker(profileId: string): Promise<DrivePick | null> {
  if (!API_KEY) throw new Error("NEXT_PUBLIC_GOOGLE_API_KEY is not set — add it to enable the Drive picker.");
  const token = await google.getAccessToken(profileId);
  if (!token) throw new Error("Connect your Google account in Settings first.");

  await loadPicker();
  const g = window.google;

  return new Promise<DrivePick | null>((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
      .setMimeTypes(PICKER_MIME_TYPES)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(g.picker.DocsViewMode.LIST);

    const builder = new g.picker.PickerBuilder()
      .addView(view)
      .enableFeature(g.picker.Feature.SUPPORT_DRIVES) // show shared drives too
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setTitle("Import slides from Google Drive")
      .setCallback((data: any) => {
        if (data.action === g.picker.Action.PICKED) {
          const doc = data.docs?.[0];
          resolve(doc ? { id: doc.id, name: doc.name, mimeType: doc.mimeType } : null);
        } else if (data.action === g.picker.Action.CANCEL) {
          resolve(null);
        }
      });
    if (APP_ID) builder.setAppId(APP_ID);
    builder.build().setVisible(true);
  });
}
