import { RESOURCES } from "./InfoGuide";
import styles from "./page.module.css";

// Pestaña Ayuda: teléfonos útiles con botones para llamar o escribir por WhatsApp con un toque, y
// los sitios de interés.

// `phone` = número para mostrar; `tel` = número para marcar; `whatsapp` = número internacional para
// wa.me (Argentina: 54 + 9 + característica sin 0 + número sin 15).
type Contact = { name: string; phone: string; tel?: string; whatsapp?: string };

const EMERGENCIES: Contact[] = [
  { name: "Emergencias", phone: "911", tel: "911" },
  { name: "Bomberos", phone: "100", tel: "100" },
];

const CONTACT_GROUPS: Array<{ title: string; contacts: Contact[] }> = [
  {
    title: "Dirección General de Defensa Civil",
    contacts: [
      { name: "Defensa Civil", phone: "362 516 2913", tel: "+543625162913", whatsapp: "5493625162913" },
      { name: "Defensa Civil", phone: "362 529 9957", tel: "+543625299957", whatsapp: "5493625299957" },
    ],
  },
  {
    title: "Otros teléfonos útiles",
    contacts: [
      { name: "Resibot", phone: "3624 858825", whatsapp: "5493624858825" },
      { name: "Sala de situación", phone: "362 532 2091", tel: "+543625322091" },
      { name: "Guardia Urbana", phone: "362 416 3740", tel: "+543624163740" },
    ],
  },
];

function ContactActions({ contact }: { contact: Contact }) {
  return (
    <div className={styles.helpActions}>
      {contact.tel ? (
        <a className={styles.helpCall} href={`tel:${contact.tel}`} aria-label={`Llamar a ${contact.name} ${contact.phone}`}>
          Llamar
        </a>
      ) : null}
      {contact.whatsapp ? (
        <a
          className={styles.helpWhatsapp}
          href={`https://wa.me/${contact.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Escribir por WhatsApp a ${contact.name} ${contact.phone}`}
        >
          WhatsApp
        </a>
      ) : null}
    </div>
  );
}

export default function HelpView() {
  return (
    <div className={styles.info}>
      <header className={styles.infoHeader}>
        <h2>Ayuda</h2>
        <p>Teléfonos para pedir ayuda o informarte. Tocá un botón para llamar o escribir directamente.</p>
      </header>

      <section className={styles.helpEmergencies} aria-label="Emergencias">
        {EMERGENCIES.map((contact) => (
          <a key={contact.tel} className={styles.helpEmergency} href={`tel:${contact.tel}`}>
            <span>{contact.name}</span>
            <strong>{contact.phone}</strong>
          </a>
        ))}
      </section>

      {CONTACT_GROUPS.map((group) => (
        <section key={group.title} className={styles.infoCard}>
          <h3>{group.title}</h3>
          <ul className={styles.helpList}>
            {group.contacts.map((contact) => (
              <li key={contact.phone} className={styles.helpItem}>
                <div>
                  <span className={styles.helpName}>{contact.name}</span>
                  <strong className={styles.helpPhone}>{contact.phone}</strong>
                </div>
                <ContactActions contact={contact} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className={styles.infoCard}>
        <h3>Sitios de interés</h3>
        <ul className={styles.infoLinks}>
          {RESOURCES.map(([label, url]) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
