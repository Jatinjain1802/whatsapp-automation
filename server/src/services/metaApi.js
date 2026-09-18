import axios from 'axios';
import { config } from '../config.js';

// Thin client over the Meta WhatsApp Business Cloud API.
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/overview

function api() {
  return axios.create({
    baseURL: `https://graph.facebook.com/${config.meta.apiVersion}`,
    headers: { Authorization: `Bearer ${config.meta.accessToken}` },
    timeout: 15000,
  });
}

// Send a pre-approved template message. Business-initiated messages outside
// the 24-hour customer service window MUST use an approved template.
export async function sendTemplateMessage({ to, templateName, language, bodyParams = [] }) {
  const components = bodyParams.length
    ? [
        {
          type: 'body',
          parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })),
        },
      ]
    : [];
  const { data } = await api().post(`/${config.meta.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: language }, components },
  });
  // data.messages[0].id is the wamid we match webhook statuses against.
  return data;
}

// Free-form text, allowed ONLY inside the 24-hour customer service window
// (i.e. the customer messaged the business within the last 24 hours).
export async function sendSessionTextMessage({ to, text }) {
  const { data } = await api().post(`/${config.meta.phoneNumberId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
  return data;
}

// Submit a template for Meta approval. Only APPROVED templates can be used
// in business-initiated broadcasts.
export async function submitTemplate({ name, language, category, bodyText, headerText, footerText }) {
  const components = [];
  if (headerText) components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
  components.push({ type: 'BODY', text: bodyText });
  if (footerText) components.push({ type: 'FOOTER', text: footerText });

  const { data } = await api().post(`/${config.meta.wabaId}/message_templates`, {
    name,
    language,
    category,
    components,
  });
  return data; // { id, status, category }
}

// Pull current template statuses from Meta (PENDING -> APPROVED/REJECTED).
export async function fetchTemplateStatuses() {
  const { data } = await api().get(`/${config.meta.wabaId}/message_templates`, {
    params: { limit: 100 },
  });
  return data.data || [];
}
