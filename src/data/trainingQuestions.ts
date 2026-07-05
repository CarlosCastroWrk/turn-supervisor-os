import type { TrainingQuestion } from '../types';

const categories: Record<string, string[]> = {
  'Role clarity': [
    'What exactly am I responsible for?',
    'Who do I report to?',
    'Who reports to me?',
    'What decisions can I make without approval?',
    'What decisions must go to Tony/Rey?',
  ],
  Workflow: [
    'What is the exact status flow from move-out to ready?',
    'What does "ready" officially mean?',
    'Who signs off on a unit?',
    'What is the final inspection process?',
    'What is the punch list process?',
  ],
  Communication: [
    'How often should I update Tony?',
    'What format does Tony prefer?',
    'Who do I call for urgent issues?',
    'What belongs in text vs phone call?',
    'What must be documented?',
  ],
  Crews: [
    'How do painters/cleaners/labor crews receive assignments?',
    'Who checks them in?',
    'How are no-shows handled?',
    'Who can reassign crews?',
    'What should I do if a crew finishes early?',
    'What should I do if a crew is slow?',
  ],
  Access: [
    'How do keys work?',
    'What if a unit is still occupied?',
    'What if I cannot access a room?',
    'Who handles lock/key problems?',
  ],
  Scope: [
    'How do I know what each unit needs?',
    'Where is the scope documented?',
    'What is included per bed?',
    'What is included per common area?',
    'What counts as extra work?',
    'Who approves extra work?',
  ],
  'Pay / production': [
    'How is production tracked?',
    'What does per-bed mean?',
    'What does per-common-area mean?',
    'How are supervisor hours/pay tracked?',
    'What documentation matters for payment?',
  ],
  Safety: [
    'What safety rules matter most?',
    'What incidents must be reported immediately?',
    'What PPE is required?',
  ],
  'Property relationship': [
    'Who is the property manager?',
    'How should I interact with property staff?',
    'What should I never say or promise?',
  ],
  'App validation': [
    'What paper forms are they already using?',
    'What status board do they already use?',
    'What would make my personal tracking useful?',
    'What information does Tony ask for most often?',
  ],
};

export const createTrainingQuestions = (createdAt: string): TrainingQuestion[] =>
  Object.entries(categories).flatMap(([category, questions], categoryIndex) =>
    questions.map((question, questionIndex) => ({
      id: `training_${categoryIndex + 1}_${questionIndex + 1}`,
      question,
      category,
      status: 'Not Asked',
      answer: '',
      followUp: '',
      createdAt,
      updatedAt: createdAt,
    })),
  );

