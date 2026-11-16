/** Prepared draft copy packs, written in advance by hand: never generated, never JEV output.
 * A pack is chosen by site category (family) and voice, and only for sections a composition
 * creates; the section stays marked as a draft. Packs never invent customers, quotations, reviews,
 * statistics, prices or times, contain no digit, currency sign or percent sign, and leave the
 * evidence groups (quotations, team, logos, statistics) and pricing alone. Each item list has as
 * many entries as the group's generic content. This module imports nothing. */
export const COPY_VOICES = Object.freeze({
  plain: 'Plain prepared drafts: direct, factual headings with short guidance for your own words.',
  warm: 'Warm prepared drafts: friendly, welcoming headings with short guidance for your own words.',
  bold: 'Bold prepared drafts: short, confident headings with short guidance for your own words.'
});
export const COPY_FAMILIES = Object.freeze(['saas', 'studio', 'portfolio', 'local', 'wellness', 'hospitality', 'event']);
export const COPY_GROUPS = Object.freeze(['hero', 'features', 'about', 'services', 'gallery', 'process', 'faq', 'contact', 'cta', 'footer']);

// Groups whose title and body change with the voice: [eyebrow, { voice: [title, body] }].
const voiced = (eyebrow, plain, warm, bold) => ({ eyebrow, voices: { plain, warm, bold } });
// Groups shared by every voice. Items are [title, body] or [title, body, meta].
const fixed = (eyebrow, title, body, items) => ({ ...(eyebrow === undefined ? {} : { eyebrow }), ...(title === undefined ? {} : { title }), ...(body === undefined ? {} : { body }), ...(items ? { items } : {}) });

const PACKS = {
  saas: {
    hero: voiced('A calmer way to work',
      ['Plan, track and ship your work in one place.', 'Describe what your product does, who it is for and the problem it removes, in one or two sentences.'],
      ['Less busywork, more of the work you enjoy.', 'Tell visitors, in a friendly sentence or two, how your product makes their day a little easier.'],
      ['Ship faster. Skip the busywork.', 'State the biggest outcome your product delivers in one short, confident sentence.']),
    about: voiced('Why we built it',
      ['Built by people who had the same problem.', 'Explain why the product exists, who builds it and how you believe the work should feel.'],
      ['We built the tool we wished we had.', 'Share how the idea started and introduce the people behind it. A personal note builds trust.'],
      ['We got tired of waiting, so we built it.', 'Say plainly what was broken and what you decided to do about it.']),
    cta: voiced('Ready when you are',
      ['See whether it fits the way you work.', 'Invite visitors to take one clear next step, such as a demo or a trial.'],
      ['Come and try it with your team.', 'Offer a friendly next step and say what happens after they get in touch.'],
      ['Start building today.', 'One sentence, one action. Make the next step obvious.']),
    features: fixed('What it does', 'Everything you need, nothing in the way.', 'Name the benefits that matter most to your users.', [
      ['One shared workspace', 'Describe how your product brings scattered work together.'],
      ['Clear next steps', 'Explain how people always know what to do next.'],
      ['Works with your tools', 'Name the kinds of tools it connects to, without listing partners you have not confirmed.']]),
    services: fixed('How we help', 'Support for every stage of adoption.', 'Replace these with the services you actually offer alongside the product.', [
      ['Onboarding', 'Describe how new teams get set up.'],
      ['Migration', 'Explain how existing work moves in.'],
      ['Ongoing support', 'Say how customers reach you and what they can expect.']]),
    gallery: fixed('Product tour', 'A closer look at the product.', 'Add real screenshots and a short caption for each view.', [
      ['The overview', 'Show the first screen people see.', 'Screen'],
      ['Daily work', 'Show where most of the work happens.', 'Screen'],
      ['Reports', 'Show how people review their progress.', 'Screen']]),
    process: fixed('Getting started', 'Up and running without the fuss.', undefined, [
      ['Sign up', 'Describe how an account is created.'],
      ['Set up your workspace', 'Explain the first configuration steps.'],
      ['Invite your team', 'Describe how others join and start working.']]),
    faq: fixed('Questions', 'Before you sign up.', 'Replace these with real answers for your visitors.', [
      ['How do I get started?', 'Describe the first step and what a new user sees.'],
      ['Can I bring my existing work?', 'Explain what can be imported and how.'],
      ['Who can I contact for help?', 'Add your support channel and when people can expect a reply.']]),
    contact: fixed('Talk to us', 'Questions about the product?', 'Tell visitors how to reach your team. Add a real public contact email in the Brand settings.'),
    footer: fixed(undefined, 'Software for focused work.', 'Add a short description of the product or your company details.')
  },
  studio: {
    hero: voiced('Design studio',
      ['Thoughtful design for brands and spaces.', 'Introduce the studio, the kind of work you take on and who you work with.'],
      ['We help good ideas find their form.', 'Say, in a warm sentence or two, what it feels like to work with you.'],
      ['Design that refuses to blend in.', 'State your point of view on design in one confident line.']),
    about: voiced('The studio',
      ['A small studio with a clear way of working.', 'Describe who you are, where you work and the principles that guide each project.'],
      ['A small team that loves a careful detail.', 'Introduce the people behind the work and what they care about.'],
      ['Small team. Strong opinions. Careful work.', 'Say what sets your studio apart, plainly and with conviction.']),
    cta: voiced('Start a project',
      ['Have a project in mind?', 'Invite visitors to share their idea and explain what happens next.'],
      ['We would love to hear what you are planning.', 'Offer a friendly first conversation and say what visitors can expect from it.'],
      ['Bring us your next big idea.', 'One clear invitation to start working together.']),
    features: fixed('Why work with us', 'Clear thinking, careful making.', 'Explain what clients can expect when they work with you.', [
      ['A clear process', 'Describe how a project moves from brief to delivery.'],
      ['Close collaboration', 'Explain how you involve clients along the way.'],
      ['Lasting results', 'Describe how the work keeps serving clients after launch.']]),
    services: fixed('What we do', 'Services shaped around your project.', 'Replace these examples with your actual services.', [
      ['Brand identity', 'Describe what an identity project includes.'],
      ['Digital design', 'Explain the websites or products you design.'],
      ['Art direction', 'Describe how you guide imagery and campaigns.']]),
    gallery: fixed('Selected work', 'Recent projects.', 'Add your own images, project names and descriptions.', [
      ['First project', 'Describe the brief and what you made.', 'Identity'],
      ['Second project', 'Describe the brief and what you made.', 'Digital'],
      ['Third project', 'Describe the brief and what you made.', 'Direction']]),
    process: fixed('How we work', 'From brief to finished work.', undefined, [
      ['Listen', 'Understand the goals, the audience and the constraints.'],
      ['Shape', 'Explore directions and agree on one together.'],
      ['Deliver', 'Refine the details and hand over everything the client needs.']]),
    faq: fixed('Good to know', 'Questions clients often ask.', 'Replace these with your real answers.', [
      ['How does a project start?', 'Describe your first conversation and what you need from a client.'],
      ['How long does a project take?', 'Explain what shapes the timeline instead of promising a duration you cannot keep.'],
      ['How is a project priced?', 'Explain how you price work and invite visitors to ask for a quote.']]),
    contact: fixed('Get in touch', 'Tell us about your project.', 'Describe how to reach the studio. Add a real public contact email in the Brand settings.'),
    footer: fixed(undefined, 'Made with care by a small studio.', 'Add your studio address or a short closing note.')
  },
  portfolio: {
    hero: voiced('Portfolio',
      ['Selected work and recent projects.', 'Introduce yourself and the kind of work you do in one or two sentences.'],
      ['Hello, and welcome to my work.', 'Say who you are and what you love to make, in your own friendly words.'],
      ['Work with a point of view.', 'State what makes your perspective yours, in one short line.']),
    about: voiced('About me',
      ['A little about my background.', 'Describe your experience, your focus and the kinds of clients or subjects you work with.'],
      ['The person behind the work.', 'Share what drew you to this work and what keeps you curious.'],
      ['Curious by nature. Precise by habit.', 'Describe your approach in a few confident words.']),
    cta: voiced('Work together',
      ['Interested in working together?', 'Explain how to start a conversation about a project or commission.'],
      ['Let’s make something together.', 'Invite visitors to say hello and share what they have in mind.'],
      ['Have a project? Let’s talk.', 'One short invitation and one clear action.']),
    features: fixed('Working with me', 'What you can expect.', 'Explain how you work with clients or collaborators.', [
      ['A personal approach', 'Describe how you get to know each project.'],
      ['Clear communication', 'Explain how you keep people informed.'],
      ['Careful delivery', 'Describe what you hand over at the end.']]),
    services: fixed('Services', 'Ways we can work together.', 'Replace these with the services or commissions you offer.', [
      ['Commissions', 'Describe the projects you take on.'],
      ['Collaborations', 'Explain how you work with other creatives.'],
      ['Workshops and talks', 'Describe any teaching or speaking you offer.']]),
    gallery: fixed('Selected work', 'A few projects worth a closer look.', 'Add your own images, titles and short descriptions.', [
      ['Project title', 'Describe the idea and your role in it.', 'Series'],
      ['Another project', 'Describe the idea and your role in it.', 'Commission'],
      ['A personal piece', 'Describe what you explored and why.', 'Personal']]),
    process: fixed('How I work', 'A simple way to work together.', undefined, [
      ['Share your idea', 'Tell me what you need and when you need it.'],
      ['Agree on a plan', 'We confirm the scope, the format and the next steps.'],
      ['Create and deliver', 'I make the work and deliver it in the agreed format.']]),
    faq: fixed('Questions', 'Things people often ask.', 'Replace these with your real answers.', [
      ['Are you taking on new projects?', 'Say whether you are available and how to ask.'],
      ['What do you need from me?', 'List what helps you start a project.'],
      ['How are rights and usage handled?', 'Explain how you license or hand over your work.']]),
    contact: fixed('Say hello', 'Let’s talk about your project.', 'Tell visitors how to reach you. Add a real public contact email in the Brand settings.'),
    footer: fixed(undefined, 'Thanks for looking.', 'Add a short note or where you are based.')
  },
  local: {
    hero: voiced('In the neighborhood',
      ['Your neighborhood place for everyday good things.', 'Say what you offer, where you are and when people can visit.'],
      ['Come in, say hello, stay a while.', 'Describe the welcome visitors can expect, in your own friendly words.'],
      ['Local. Fresh. Ready when you are.', 'Name the one thing people should come in for.']),
    about: voiced('Our story',
      ['A local business with a simple idea.', 'Tell visitors how you started, who runs the place and what you care about.'],
      ['We are glad you found us.', 'Share the story of the place and the people who make it what it is.'],
      ['Proudly local. Properly made.', 'Say what you do differently, in one confident sentence.']),
    cta: voiced('Visit us',
      ['Plan your visit.', 'Tell visitors how to find you, when you are open and whether to book ahead.'],
      ['We would love to see you soon.', 'Invite visitors in and mention anything that makes a first visit easier.'],
      ['Drop by today.', 'One short invitation with your address or booking link.']),
    features: fixed('Why visit', 'The little things we get right.', 'Name what makes a visit worthwhile.', [
      ['Made with care', 'Describe what you make or prepare and how.'],
      ['Friendly service', 'Explain how you look after your visitors.'],
      ['Easy to find', 'Describe where you are and how to get there.']]),
    services: fixed('What we offer', 'Something for every visit.', 'Replace these examples with what you actually offer, and add prices you have confirmed.', [
      ['For here', 'Describe what visitors can enjoy on site.'],
      ['To take away', 'Explain what can be ordered to go.'],
      ['For groups and events', 'Describe any bookings for larger groups.']]),
    gallery: fixed('Take a look', 'Inside and around.', 'Add real photos of your place, your products and your neighborhood.', [
      ['The space', 'Add a photo and a short caption.', 'Inside'],
      ['What we make', 'Add a photo and a short caption.', 'Made here'],
      ['The neighborhood', 'Add a photo and a short caption.', 'Nearby']]),
    process: fixed('How it works', 'Simple from start to finish.', undefined, [
      ['Choose', 'Describe how visitors pick what they want.'],
      ['Order or book', 'Explain how to order, book or reserve.'],
      ['Enjoy', 'Describe what happens on the day.']]),
    faq: fixed('Good to know', 'Before you visit.', 'Replace these with real answers.', [
      ['Do I need to book?', 'Explain whether visitors should reserve ahead.'],
      ['Is the space accessible?', 'Describe step-free access, seating and facilities.'],
      ['Do you take special requests?', 'Describe what you can adapt and how to ask.']]),
    contact: fixed('Find us', 'Come and visit.', 'Add your address and opening times, and a real public contact email in the Brand settings.'),
    footer: fixed(undefined, 'Your neighborhood place.', 'Add your address and opening times.')
  },
  wellness: {
    hero: voiced('Wellness and care',
      ['Space to rest, move and feel well.', 'Describe your practice, who it is for and how people can begin.'],
      ['A gentle place to come back to yourself.', 'Tell visitors, kindly and simply, how you hope they will feel.'],
      ['Make time for yourself. Start today.', 'Name the first step in one short, encouraging sentence.']),
    about: voiced('About the practice',
      ['A calm practice with a personal approach.', 'Describe your background, your training and the way you work with people.'],
      ['Every session begins with listening.', 'Share what led you to this work and how you care for the people you see.'],
      ['Care that starts with you.', 'Say what makes your approach different, in one clear sentence.']),
    cta: voiced('Begin',
      ['Book a first session.', 'Explain how to book and what a first visit includes.'],
      ['Whenever you are ready, we are here.', 'Offer a gentle first step and say what to expect.'],
      ['Take the first step today.', 'One clear invitation and one action.']),
    features: fixed('What to expect', 'Care at your own pace.', 'Describe what makes your sessions supportive and safe.', [
      ['Personal attention', 'Explain how each session is shaped around the person.'],
      ['A calm setting', 'Describe the space and its atmosphere.'],
      ['Flexible formats', 'Explain whether you offer group, private or online sessions.']]),
    services: fixed('Sessions', 'Ways to practice with us.', 'Replace these with your actual sessions, and add prices you have confirmed.', [
      ['Group classes', 'Describe the classes and who they suit.'],
      ['Private sessions', 'Explain what a one-to-one session includes.'],
      ['Workshops', 'Describe any longer or themed sessions.']]),
    gallery: fixed('The space', 'A place to slow down.', 'Add real photos of your space and sessions, with permission from anyone shown.', [
      ['The studio', 'Add a photo and a short caption.', 'Space'],
      ['A session', 'Add a photo and a short caption.', 'Practice'],
      ['Small details', 'Add a photo and a short caption.', 'Details']]),
    process: fixed('Getting started', 'A gentle way to begin.', undefined, [
      ['Get in touch', 'Tell us a little about yourself and what you are looking for.'],
      ['Meet', 'Describe the first session or conversation.'],
      ['Continue at your pace', 'Explain how people carry on from there.']]),
    faq: fixed('Questions', 'Before your first session.', 'Replace these with real answers.', [
      ['Do I need any experience?', 'Explain who your sessions suit.'],
      ['What should I bring?', 'List what visitors need on the day.'],
      ['Can I cancel or reschedule?', 'Describe your cancellation terms.']]),
    contact: fixed('Get in touch', 'Happy to answer your questions.', 'Tell visitors how to reach you. Add a real public contact email in the Brand settings.'),
    footer: fixed(undefined, 'Rest, move, feel well.', 'Add your address or a short closing note.')
  },
  hospitality: {
    hero: voiced('A place to stay',
      ['A comfortable stay in a quiet setting.', 'Describe the place, where it is and who it suits.'],
      ['Make yourself at home.', 'Tell guests, warmly, what a stay with you feels like.'],
      ['Wake up somewhere better.', 'Sum up the stay in one short, confident line.']),
    about: voiced('About the place',
      ['A small place with a lot of character.', 'Describe the building, the setting and the people who look after it.'],
      ['Hosts who look after every stay.', 'Introduce your hosts and what you love about the place.'],
      ['Small in size. Big on welcome.', 'Say what makes a stay here different.']),
    cta: voiced('Plan your stay',
      ['Ask about your dates.', 'Explain how guests can ask about dates and book.'],
      ['We would love to welcome you.', 'Invite guests to get in touch and mention anything that helps them plan.'],
      ['Your stay starts here.', 'One short invitation and one clear action.']),
    features: fixed('The details', 'Everything for an easy stay.', 'Replace these with the amenities you actually offer.', [
      ['Comfortable rooms', 'Describe the beds, the light and the quiet.'],
      ['Thoughtful extras', 'List the small things guests appreciate.'],
      ['A good location', 'Describe what is close by.']]),
    services: fixed('During your stay', 'Here to help.', 'Replace these with the services you actually offer.', [
      ['Breakfast', 'Describe whether and how breakfast is served.'],
      ['Local tips', 'Explain how you help guests explore the area.'],
      ['Arrival and departure', 'Describe check-in, check-out and luggage.']]),
    gallery: fixed('Take a look around', 'Space to settle in.', 'Add real photos of the rooms, the shared spaces and the surroundings.', [
      ['The rooms', 'Add a real photo and description.', 'Inside'],
      ['Shared spaces', 'Add a real photo and description.', 'Together'],
      ['The surroundings', 'Add a real photo and description.', 'Outside']]),
    process: fixed('Booking', 'Booking made simple.', undefined, [
      ['Choose your dates', 'Describe how guests check availability.'],
      ['Confirm your stay', 'Explain how a booking is confirmed.'],
      ['Arrive and relax', 'Describe arrival and what guests should know.']]),
    faq: fixed('Good to know', 'Questions before you book.', 'Replace these with real answers.', [
      ['When is check-in?', 'Add your check-in and check-out times.'],
      ['Is parking available?', 'Describe parking or transport options.'],
      ['Are pets welcome?', 'Explain your policy for pets.']]),
    contact: fixed('Contact', 'Ask us anything about your stay.', 'Add your address and how to reach you, and a real public contact email in the Brand settings.'),
    footer: fixed(undefined, 'A place to slow down.', 'Add your address and how to reach you.')
  },
  event: {
    hero: voiced('Save the date',
      ['A gathering for people who make things happen.', 'Describe the event, who it is for, and when and where it takes place.'],
      ['Join us for ideas, conversation and good company.', 'Tell attendees, warmly, what the experience will be like.'],
      ['Be in the room where it happens.', 'Sum up why people should not miss it, in one short line.']),
    about: voiced('About the event',
      ['What this event is about.', 'Describe the theme, the organizers and who should attend.'],
      ['Made by people who love bringing others together.', 'Share why you organize this event and what you hope people take home.'],
      ['Fewer slides. More real conversations.', 'State what makes this event different, in one confident line.']),
    cta: voiced('Join us',
      ['Reserve your place.', 'Explain how to register and what registration includes.'],
      ['We hope to see you there.', 'Invite people to register and mention anything that helps them plan.'],
      ['Get your ticket.', 'One clear invitation and one action.']),
    features: fixed('Why attend', 'Time well spent.', 'Name what attendees will gain.', [
      ['Practical sessions', 'Describe the kind of sessions on the program.'],
      ['People worth meeting', 'Explain who attends, without naming people who have not confirmed.'],
      ['A welcoming venue', 'Describe the venue and its facilities.']]),
    services: fixed('Formats', 'Ways to take part.', 'Replace these with the formats you actually offer.', [
      ['Talks', 'Describe the talks and their topics.'],
      ['Workshops', 'Explain the hands-on sessions.'],
      ['Meetups', 'Describe the informal parts of the event.']]),
    gallery: fixed('Moments', 'Scenes from the event.', 'Add real photos, with permission from anyone shown.', [
      ['The venue', 'Add a photo and a short caption.', 'Venue'],
      ['On stage', 'Add a photo and a short caption.', 'Talks'],
      ['In between', 'Add a photo and a short caption.', 'Breaks']]),
    process: fixed('Program', 'How the event unfolds.', undefined, [
      ['Arrive and register', 'Describe arrival, registration and the welcome.'],
      ['Sessions', 'Outline the main part of the program.'],
      ['Close and connect', 'Describe how the event ends.']]),
    faq: fixed('Questions', 'Before you register.', 'Replace these with real answers.', [
      ['Who is this event for?', 'Describe the audience you have in mind.'],
      ['What does a ticket include?', 'List what is included, and add prices only once they are confirmed.'],
      ['How do I get to the venue?', 'Describe the address and transport options.']]),
    contact: fixed('Questions?', 'Get in touch with the organizers.', 'Tell attendees how to reach you. Add a real public contact email in the Brand settings.'),
    footer: fixed(undefined, 'See you there.', 'Add the event name, the venue and the organizers.')
  }
};

/** The prepared copy of one group for a family and a voice, as a fresh object, or null when no
 * pack covers them: `{ eyebrow?, title?, body?, items?: [{ title, body, meta? }] }`. */
export function copyFor(group, family, voice) {
  if (typeof voice !== 'string' || !Object.hasOwn(COPY_VOICES, voice)) return null;
  if (typeof family !== 'string' || !Object.hasOwn(PACKS, family) || typeof group !== 'string' || !Object.hasOwn(PACKS[family], group)) return null;
  const pack = PACKS[family][group];
  if (pack.voices) {
    const [title, body] = pack.voices[voice];
    return { eyebrow: pack.eyebrow, title, body };
  }
  return {
    ...(pack.eyebrow === undefined ? {} : { eyebrow: pack.eyebrow }),
    ...(pack.title === undefined ? {} : { title: pack.title }),
    ...(pack.body === undefined ? {} : { body: pack.body }),
    ...(pack.items ? { items: pack.items.map(([title, body, meta]) => ({ title, body, ...(meta === undefined ? {} : { meta }) })) } : {})
  };
}
