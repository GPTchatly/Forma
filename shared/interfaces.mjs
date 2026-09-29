/** Prepared application interfaces and their bounded, executable-code-free controls.
 * Item content remains ordinary editable text; uiType selects authored markup. */
export const INTERFACE_BLOCKS = [
  { id: 'app-login', name: 'Sign in', kind: 'login', description: 'An editable sign-in screen with email, password and a local form demonstration.' },
  { id: 'app-signup', name: 'Create account', kind: 'signup', description: 'An account-registration frontend with editable fields and a local form demonstration.' },
  { id: 'app-chat', name: 'Chat workspace', kind: 'chat', description: 'A conversational assistant frontend with a conversation sidebar, message area and composer.' },
  { id: 'app-dashboard', name: 'Dashboard', kind: 'dashboard', description: 'An application overview with editable metric cards, activity and visual summaries.' },
  { id: 'app-table', name: 'Data table', kind: 'table', description: 'A searchable data-management frontend with editable rows and status labels.' },
  { id: 'app-board', name: 'Task board', kind: 'board', description: 'A kanban-style workspace with editable task cards grouped into workflow columns.' },
  { id: 'app-settings', name: 'Settings', kind: 'settings', description: 'An application settings frontend with editable text fields, choices and toggles.' },
  { id: 'app-inbox', name: 'Inbox', kind: 'inbox', description: 'A message inbox frontend with a thread list and reading pane.' },
  { id: 'app-calendar', name: 'Calendar', kind: 'calendar', description: 'A calendar frontend with an editable event list and monthly overview.' },
  { id: 'app-storefront', name: 'Storefront', kind: 'storefront', description: 'A product browsing frontend with editable product cards and local cart interactions.' },
  { id: 'app-checkout', name: 'Checkout', kind: 'checkout', description: 'A checkout frontend with contact fields and an order summary; no payment processing.' },
  { id: 'app-editor', name: 'Document editor', kind: 'editor', description: 'A writing workspace with editable document fields and a local editing surface.' },
  { id: 'app-workspace', name: 'Custom workspace', kind: 'workspace', description: 'A flexible application frontend combining typed fields, lists, tasks, metrics and actions.' }
];

const blockId = (block) => typeof block === 'string' ? block : block?.block;
export const isInterfaceBlock = (block) => INTERFACE_BLOCKS.some((entry) => entry.id === blockId(block));
const allBlocks = INTERFACE_BLOCKS.map(({ id }) => id);
const workspaceBlocks = allBlocks.filter((id) => !['app-login', 'app-signup', 'app-checkout'].includes(id));
const visibility = { default: 'Component default', show: 'Show', hide: 'Hide' };
export const INTERFACE_CONTROLS = {
  layout: { label: 'Application layout', description: 'Choose an authored responsive layout for the application screen.', options: { default: 'Component default', centered: 'Centered', split: 'Split view', sidebar: 'Sidebar', topbar: 'Top navigation' }, blocks: allBlocks },
  navigation: { label: 'Application navigation', description: 'Show or hide the application screen navigation.', options: { ...visibility }, blocks: workspaceBlocks },
  search: { label: 'Application search', description: 'Show or hide local search for the visible application items.', options: { ...visibility }, blocks: ['app-chat', 'app-dashboard', 'app-table', 'app-board', 'app-inbox', 'app-calendar', 'app-storefront', 'app-workspace'] },
  tabs: { label: 'Application tabs', description: 'Show or hide the prepared local view tabs.', options: { ...visibility }, blocks: ['app-dashboard', 'app-table', 'app-board', 'app-settings', 'app-inbox', 'app-calendar', 'app-storefront', 'app-workspace'] },
  metrics: { label: 'Application metrics', description: 'Show or hide the editable summary cards above application content.', options: { ...visibility }, blocks: ['app-dashboard', 'app-table', 'app-board', 'app-workspace'] }
};
export const DEFAULT_INTERFACE = Object.fromEntries(Object.keys(INTERFACE_CONTROLS).map((key) => [key, 'default']));
export function interfaceFieldsFor(block) {
  const id = blockId(block);
  return Object.entries(INTERFACE_CONTROLS).filter(([, control]) => control.blocks.includes(id)).map(([key]) => key);
}

export const INTERFACE_ITEM_TYPES = ['default', 'text', 'email', 'password', 'textarea', 'select', 'checkbox', 'number', 'date', 'stat', 'list', 'table', 'chart', 'form', 'action', 'product', 'thread', 'event', 'task'];
const formTypes = ['default', 'text', 'email', 'password', 'textarea', 'select', 'checkbox', 'number', 'date', 'action'];
const itemTypes = {
  'app-login': formTypes, 'app-signup': formTypes, 'app-settings': formTypes,
  'app-chat': ['default', 'thread', 'action'],
  'app-dashboard': ['default', 'stat', 'list', 'chart', 'table', 'task', 'action'],
  'app-table': ['default', 'table'], 'app-board': ['default', 'task'],
  'app-inbox': ['default', 'thread'], 'app-calendar': ['default', 'event'],
  'app-storefront': ['default', 'product'], 'app-checkout': [...formTypes, 'product'],
  'app-editor': ['default', 'text', 'textarea', 'list', 'action'],
  'app-workspace': INTERFACE_ITEM_TYPES
};
export function interfaceItemTypesFor(block) {
  const id = blockId(block);
  return Object.hasOwn(itemTypes, id) ? [...itemTypes[id]] : [];
}

const item = (title, body = '', uiType = 'list', meta = '', price = '') => ({ title, body, uiType, meta, price });
const prepared = {
  'app-login': { eyebrow: 'Welcome back', title: 'Sign in to your workspace', body: 'Enter your details to continue.', button: 'Sign in', items: [item('Email address', 'you@example.com', 'email'), item('Password', 'Enter your password', 'password'), item('Remember me', '', 'checkbox')] },
  'app-signup': { eyebrow: 'Get started', title: 'Create your account', body: 'A new workspace starts here.', button: 'Create account', items: [item('Full name', 'Your name', 'text'), item('Email address', 'you@example.com', 'email'), item('Password', 'Choose a password', 'password'), item('I agree to the terms', '', 'checkbox')] },
  'app-chat': { eyebrow: 'Your assistant', title: 'What can we work on?', body: 'Ask a question, explore an idea, or start something new.', button: 'Send message', items: [item('A fresh idea', 'Explore possibilities for your next project.', 'thread', 'Today'), item('Project planning', 'Break a project into clear next steps.', 'thread', 'Yesterday'), item('Writing partner', 'Shape an outline or refine your wording.', 'thread', 'Earlier')] },
  'app-dashboard': { eyebrow: 'Overview', title: 'Your workspace at a glance', body: 'Keep your work, activity and next steps in view.', button: 'New project', items: [item('Active projects', 'Add your current project count.', 'stat', 'Projects', '—'), item('Tasks completed', 'Add your completed-task count.', 'stat', 'Tasks', '—'), item('Weekly activity', 'Replace with your own activity details.', 'chart', 'This week'), item('Getting started', 'Set up your workspace and add your first project.', 'list', 'To do')] },
  'app-table': { eyebrow: 'Workspace', title: 'Projects', body: 'Organize your records and find what you need.', button: 'Add record', items: [item('Website refresh', 'Design team', 'table', 'In progress', 'Sep 30'), item('Product research', 'Research team', 'table', 'Planned', 'Oct 04'), item('Launch checklist', 'Operations', 'table', 'Review', 'Oct 08')] },
  'app-board': { eyebrow: 'Projects', title: 'Team board', body: 'Give every task a place and a next step.', button: 'Add task', items: [item('Define the brief', 'Capture the goal and requirements.', 'task', 'To do'), item('Explore concepts', 'Review a few possible directions.', 'task', 'In progress'), item('Share the first draft', 'Collect feedback and agree on next steps.', 'task', 'Done')] },
  'app-settings': { eyebrow: 'Account', title: 'Settings', body: 'Manage your profile and workspace preferences.', button: 'Save changes', items: [item('Display name', 'Your name', 'text'), item('Email address', 'you@example.com', 'email'), item('Language', 'English\nFinnish\nSwedish', 'select'), item('Email notifications', 'Receive workspace updates.', 'checkbox')] },
  'app-inbox': { eyebrow: 'Messages', title: 'Inbox', body: 'Conversations, updates and next steps in one place.', button: 'Compose message', items: [item('Project update', 'The latest draft is ready for your review.', 'thread', 'Today'), item('Planning notes', 'Here are the topics for our next conversation.', 'thread', 'Yesterday'), item('Welcome to your workspace', 'Start by adding the conversations that matter to you.', 'thread', 'Earlier')] },
  'app-calendar': { eyebrow: 'Schedule', title: 'Your calendar', body: 'Make room for the work and moments that matter.', button: 'Add event', items: [item('Project planning', 'Outline the next steps together.', 'event', 'Monday', '09:00'), item('Design review', 'Review the latest work and share feedback.', 'event', 'Wednesday', '14:00'), item('Weekly wrap-up', 'Reflect on progress and plan ahead.', 'event', 'Friday', '16:00')] },
  'app-storefront': { eyebrow: 'The collection', title: 'Find your next favorite', body: 'Add your own products, descriptions and prices.', button: 'View cart', items: [item('Everyday essential', 'Replace with your product details.', 'product', 'Collection one', 'Add price'), item('Thoughtful details', 'Replace with your product details.', 'product', 'Collection two', 'Add price'), item('Something special', 'Replace with your product details.', 'product', 'Collection three', 'Add price')] },
  'app-checkout': { eyebrow: 'Your order', title: 'Checkout', body: 'Review your order and enter your contact details.', button: 'Review order', items: [item('Email address', 'you@example.com', 'email'), item('Full name', 'Your name', 'text'), item('Delivery address', 'Street address', 'text'), item('City', 'City', 'text'), item('Selected item', 'Replace with your order details.', 'product', 'Quantity 1', 'Add price')] },
  'app-editor': { eyebrow: 'Documents', title: 'Untitled document', body: 'A clear space for your next idea.', button: 'Save draft', items: [item('Document title', 'Untitled document', 'text'), item('Your document', 'Start writing here…', 'textarea')] },
  'app-workspace': { eyebrow: 'Workspace', title: 'Make it your own', body: 'Combine fields, lists, tasks and actions into the interface you need.', button: 'New item', items: [item('Getting started', 'Describe the first thing people can do here.', 'list', 'Overview'), item('Your next task', 'Add an action to move the work forward.', 'task', 'To do'), item('Quick action', 'Add a useful shortcut for your workflow.', 'action')] }
};

export function preparedInterface(block) {
  const id = blockId(block);
  if (!Object.hasOwn(prepared, id)) throw new Error('Unknown application interface.');
  const content = prepared[id];
  return { ...content, href: '', items: content.items.map((entry) => ({ ...entry })) };
}
