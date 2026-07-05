import { useMemo, useState } from 'react';
import { Button, Field } from '../components/FormControls';
import { Section } from '../components/Section';
import { StatusBadge } from '../components/StatusBadge';
import { updateTrainingQuestion } from '../lib/actions';
import { TRAINING_STATUSES } from '../lib/constants';
import type { AppData, TrainingQuestionStatus } from '../types';

interface TrainingQuestionsViewProps {
  data: AppData;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
}

export function TrainingQuestionsView({ data, setData }: TrainingQuestionsViewProps) {
  const categories = Array.from(new Set(data.trainingQuestions.map((question) => question.category)));
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('All');

  const questions = useMemo(
    () =>
      data.trainingQuestions.filter((question) => {
        const categoryMatches = category === 'All' || question.category === category;
        const statusMatches = status === 'All' || question.status === status;
        return categoryMatches && statusMatches;
      }),
    [category, data.trainingQuestions, status],
  );

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="quiet-label">Ask better questions</span>
          <h1>Training Questions</h1>
        </div>
      </div>

      <Section title="Filters" kicker={`${questions.length} shown`}>
        <div className="filter-panel">
          <Field label="Category">
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option>All</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>All</option>
              {TRAINING_STATUSES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Questions" kicker="Training-ready">
        <div className="question-list">
          {questions.map((question) => (
            <article className="question-card" key={question.id}>
              <div className="question-card__header">
                <div>
                  <span className="quiet-label">{question.category}</span>
                  <h3>{question.question}</h3>
                </div>
                <StatusBadge value={question.status} />
              </div>
              <div className="quick-status-row">
                {TRAINING_STATUSES.map((item) => (
                  <Button
                    key={item}
                    className={question.status === item ? 'is-selected' : ''}
                    onClick={() => setData((current) => updateTrainingQuestion(current, question.id, { status: item as TrainingQuestionStatus }))}
                  >
                    {item}
                  </Button>
                ))}
              </div>
              <div className="grid two">
                <Field label="Answer">
                  <textarea
                    rows={3}
                    value={question.answer}
                    onChange={(event) => setData((current) => updateTrainingQuestion(current, question.id, { answer: event.target.value }))}
                  />
                </Field>
                <Field label="Follow-up">
                  <textarea
                    rows={3}
                    value={question.followUp}
                    onChange={(event) => setData((current) => updateTrainingQuestion(current, question.id, { followUp: event.target.value }))}
                  />
                </Field>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}

