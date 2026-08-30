import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyQuestions, isLegacyQuizTemplate, normalizeLegacyQuizQuestions, parseQuizImport, validateCertificateQuiz } from '../src/utils/quizImport.js';

const source = `1. Según el Magíster Rafael Monzón, al diagnosticar un duelo, ¿qué factor ha demostrado la ciencia que debe considerarse antes de la temporalidad (el tiempo transcurrido)? A) La edad de la persona que sufre la pérdida. B) La intensidad de la sintomatología. C) El número de familiares que están apoyando el proceso. Respuesta correcta: B
2. ¿Qué tipos de situaciones se consideran como causas válidas para experimentar un proceso de "duelo", según lo expuesto al inicio de la ponencia? A) Exclusivamente el fallecimiento de un familiar de primer grado. B) Solo la muerte por causas traumáticas como homicidios, suicidios o accidentes. C) Cualquier pérdida significativa, incluyendo relaciones, amistades, trabajos o el fallecimiento de un ser querido. Respuesta correcta: C
3. Aproximadamente, ¿qué porcentaje de las personas que sufren un duelo por razones traumáticas pueden llegar a desarrollar un "duelo complejo"? A) Alrededor del 49%. B) Solo el 5%. C) Más del 90%. Respuesta correcta: A
4. Pregunta cuatro de prueba con contenido
envuelto en dos líneas.
A) Primera opción.
B) Segunda opción.
C) Tercera opción.
Respuesta correcta: C
5. Pregunta cinco. A) Opción A. B) Opción B. C) Opción C. D) Opción D. E) Opción E. F) Opción F. Respuesta correcta: F
6. Pregunta seis. A) Opción A. B) Opción B. C) Opción C. Respuesta correcta: A
7. Pregunta siete. A) Opción A. B) Opción B. C) Opción C. Respuesta correcta: B
8. Pregunta ocho. A) Opción A. B) Opción B. C) Opción C. Respuesta correcta: C
9. Pregunta nueve. A) Opción A. B) Opción B. C) Opción C. Respuesta correcta: A
10. Pregunta diez. A) Opción A. B) Opción B. C) Opción C. Respuesta correcta: B`;

test('crea diez preguntas completamente vacías', () => {
  assert.deepEqual(createEmptyQuestions(), Array.from({ length: 10 }, () => ({ question: '', options: ['', '', ''], correctAnswer: null })));
});

test('normaliza exclusivamente la plantilla antigua de diez preguntas', () => {
  const legacyQuestions = Array.from({ length: 10 }, (_, index) => ({
    question: `Pregunta ${index + 1}`,
    options: ['Opción 1', 'Opción 2', 'Opción 3'],
    correctAnswer: 0,
  }));

  assert.equal(isLegacyQuizTemplate(legacyQuestions), true);
  assert.deepEqual(normalizeLegacyQuizQuestions(legacyQuestions), createEmptyQuestions());
});

test('preserva una evaluación con contenido real aunque se parezca a la plantilla', () => {
  const realQuestions = Array.from({ length: 10 }, (_, index) => ({
    question: index === 0 ? 'Pregunta 1 sobre ética profesional' : `Pregunta ${index + 1}`,
    options: ['Opción 1', 'Opción 2', 'Opción 3'],
    correctAnswer: 0,
  }));

  assert.equal(isLegacyQuizTemplate(realQuestions), false);
  assert.equal(normalizeLegacyQuizQuestions(realQuestions), realQuestions);
});

test('importa el formato entregado y conserva las respuestas correctas', () => {
  const result = parseQuizImport(source);
  assert.equal(result.ok, true);
  assert.equal(result.questions.length, 10);
  assert.equal(result.questions[0].question.startsWith('Según el Magíster Rafael Monzón'), true);
  assert.equal(result.questions[0].options[1], 'La intensidad de la sintomatología.');
  assert.equal(result.questions[0].correctAnswer, 1);
  assert.equal(result.questions[1].correctAnswer, 2);
  assert.equal(result.questions[2].correctAnswer, 0);
  assert.equal(result.questions[3].question, 'Pregunta cuatro de prueba con contenido envuelto en dos líneas.');
  assert.equal(result.questions[4].options.length, 6);
  assert.equal(result.questions[4].correctAnswer, 5);
  assert.equal(validateCertificateQuiz(result.questions), '');
});

test('también importa si las preguntas quedaron pegadas en una sola línea', () => {
  const result = parseQuizImport(source.replace(/\n/g, ' '));
  assert.equal(result.ok, true);
  assert.equal(result.questions.length, 10);
  assert.equal(result.questions[0].correctAnswer, 1);
  assert.equal(result.questions[9].correctAnswer, 1);
});

test('no importa ni permite guardar evaluaciones con menos de diez preguntas', () => {
  const result = parseQuizImport(source.split('\n').slice(0, 3).join('\n'));
  assert.equal(result.ok, false);
  assert.match(result.error, /exactamente 10/i);
  assert.match(validateCertificateQuiz(createEmptyQuestions()), /Completa la pregunta 1/i);
});
