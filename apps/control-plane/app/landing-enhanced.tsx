'use client';

import { useState, useEffect } from 'react';

type FAQItem = {
  question: string;
  answer: string;
};

const faqs: FAQItem[] = [
  {
    question: 'What makes AID different from other AI assistants?',
    answer: 'AID is built specifically for business owners. It connects to your actual Google Workspace, understands your business context, and can execute actions like sending emails, creating calendar events, and finding files—all with your explicit approval.'
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes. We use OAuth 2.0 for secure authentication, encrypt all tokens, and never store your passwords. Your data remains yours, and you can revoke access at any time.'
  },
  {
    question: 'What Google Workspace apps does AID support?',
    answer: 'Currently: Gmail, Google Calendar, Google Drive, Google Docs, and Google Sheets. Microsoft 365 support is coming soon.'
  },
  {
    question: 'Can I use AID for automated tasks?',
    answer: 'AID can create automations for recurring tasks like daily briefings, email summaries, and calendar reminders. Every action requires your approval before execution.'
  },
  {
    question: 'How much does AID cost?',
    answer: 'We offer a free tier to get started. Premium plans with advanced automations and priority support are coming soon.'
  },
  {
    question: 'Can I export my chat history?',
    answer: 'Yes. All your conversations are yours. You can export them anytime from your settings.'
  }
];

type Capability = {
  icon: string;
  title: string;
  description: string;
};

const capabilities: Capability[] = [
  {
    icon: '✉️',
    title: 'Email Intelligence',
    description: 'Search, read, and draft emails. Get summaries of important messages.'
  },
  {
    icon: '📅',
    title: 'Calendar Assistant',
    description: 'Check availability, create events, and manage your schedule.'
  },
  {
    icon: '📁',
    title: 'Drive Search',
    description: 'Find files and documents, read shared content instantly.'
  },
  {
    icon: '📝',
    title: 'Content Creation',
    description: 'Write, edit, and improve your documents and spreadsheets.'
  },
  {
    icon: '🔄',
    title: 'Automations',
    description: 'Create workflows for daily briefings and recurring tasks.'
  },
  {
    icon: '🛡️',
    title: 'Always Safe',
    description: 'Approve every action. Full transparency and control.'
  }
];

export function LandingEnhanced() {
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* Enhanced FAQ Section */}
      <section className="landing-section landing-faq">
        <div className="section-intro">
          <p className="eyebrow">Questions?</p>
          <h2>Frequently Asked</h2>
        </div>
        <div className="faq-container">
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className={`faq-item ${expandedFAQ === index ? 'active' : ''}`}
              >
                <button
                  className="faq-question"
                  onClick={() => setExpandedFAQ(expandedFAQ === index ? null : index)}
                  aria-expanded={expandedFAQ === index}
                >
                  <span>{faq.question}</span>
                  <span className="faq-toggle">▼</span>
                </button>
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

// Export capability list for use in main landing
export { capabilities };
