/* How people reach the Dixlab team. Keep in sync with DIXLAB_CONTACT_EMAIL on the server. */
export const CONTACT_EMAIL = 'hello@dixlab.click';
export const mailto = (subject) => `mailto:${CONTACT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
