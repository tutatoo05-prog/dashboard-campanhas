import { Link } from 'react-router-dom'
import type { ActionLink, ActionStep } from '@/lib/actionGuides.ts'

/** Texto com **negrito** (nomes de campanha e de anúncio). */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, index) =>
        index % 2 ? (
          <b key={index} className="rich-name">
            {part}
          </b>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

/** Botão de link: abre a Meta/páginas em outra aba, ou uma tela do próprio painel. */
export function StepLink({ link, className = 'step-link' }: { link: ActionLink; className?: string }) {
  if (link.external) {
    return (
      <a className={className} href={link.href} target="_blank" rel="noreferrer">
        {link.label}
        <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
      </a>
    )
  }
  return (
    <Link className={className} to={link.href}>
      {link.label}
      <i className="fa-solid fa-arrow-right" aria-hidden="true" />
    </Link>
  )
}

/** Um passo do tutorial: o que fazer, como fazer e os links. */
export function StepContent({ step }: { step: ActionStep }) {
  return (
    <span className="step-body">
      <span className="step-text">
        <RichText text={step.text} />
      </span>
      {step.detail && (
        <small className="step-detail">
          <RichText text={step.detail} />
        </small>
      )}
      {step.links && step.links.length > 0 && (
        <span className="step-links">
          {step.links.map((link) => (
            <StepLink key={`${link.href}-${link.label}`} link={link} />
          ))}
        </span>
      )}
    </span>
  )
}
