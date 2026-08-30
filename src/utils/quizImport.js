export const createEmptyQuestions = () => Array.from({ length: 10 }, () => ({
  question: '',
  options: ['', '', ''],
  correctAnswer: null,
}));

/**
 * Identifica únicamente la plantilla antigua que se mostraba como contenido
 * precargado. La comparación es deliberadamente estricta para no borrar una
 * evaluación que el administrador ya haya comenzado a redactar.
 */
export function isLegacyQuizTemplate(questions) {
  return Array.isArray(questions)
    && questions.length === 10
    && questions.every((item, index) => (
      item?.question === `Pregunta ${index + 1}`
      && Array.isArray(item.options)
      && item.options.length === 3
      && item.options.every((option, optionIndex) => option === `Opción ${optionIndex + 1}`)
      && item.correctAnswer === 0
    ));
}

/**
 * Convierte la plantilla heredada en campos vacíos al abrir el editor.
 * Cualquier evaluación con contenido distinto se conserva tal como está.
 */
export function normalizeLegacyQuizQuestions(questions) {
  return isLegacyQuizTemplate(questions) ? createEmptyQuestions() : questions;
}

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

/**
 * Convierte el formato habitual de una evaluación en preguntas autocorregibles.
 * Las preguntas pueden ocupar varias líneas; las opciones se identifican por A) a F).
 */
export function parseQuizImport(source) {
  const text = String(source || '')
    .replace(/\r\n?/g, '\n')
    .replace(/(respuesta\s+correcta\s*:\s*[A-F])\s+(?=\d{1,2}\s*[.)]\s+)/gi, '$1\n')
    .trim();
  if (!text) return { ok: false, error: 'Pega las 10 preguntas antes de importar.' };

  const starts = [...text.matchAll(/(?:^|\n)\s*(\d{1,2})\s*[.)]\s*/g)];
  if (starts.length !== 10) {
    return { ok: false, error: `Se encontraron ${starts.length} preguntas. Deben ser exactamente 10.` };
  }

  const questions = [];
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index];
    if (Number(start[1]) !== index + 1) {
      return { ok: false, error: `La numeración debe ir en orden del 1 al 10. Revisa la pregunta ${index + 1}.` };
    }
    const blockStart = start.index + start[0].length;
    const blockEnd = index + 1 < starts.length ? starts[index + 1].index : text.length;
    const block = text.slice(blockStart, blockEnd).trim();
    const answerMatch = block.match(/respuesta\s+correcta\s*:\s*([A-F])\b/i);
    if (!answerMatch) {
      return { ok: false, error: `La pregunta ${index + 1} no tiene una “Respuesta correcta: A-F” válida.` };
    }

    const content = block.slice(0, answerMatch.index).trim();
    const optionMarkers = [...content.matchAll(/(?:^|\s)([A-F])\)\s*/gi)];
    if (optionMarkers.length < 3 || optionMarkers.length > 6) {
      return { ok: false, error: `La pregunta ${index + 1} debe incluir entre 3 y 6 opciones, de A) a F).` };
    }

    const question = cleanText(content.slice(0, optionMarkers[0].index));
    const options = optionMarkers.map((marker, optionIndex) => {
      const optionStart = marker.index + marker[0].length;
      const optionEnd = optionIndex + 1 < optionMarkers.length ? optionMarkers[optionIndex + 1].index : content.length;
      return cleanText(content.slice(optionStart, optionEnd));
    });
    const letters = optionMarkers.map(marker => marker[1].toUpperCase());
    const answerLetter = answerMatch[1].toUpperCase();
    const correctAnswer = letters.indexOf(answerLetter);

    if (!question || options.some(option => !option) || correctAnswer < 0) {
      return { ok: false, error: `Revisa la pregunta ${index + 1}: enunciado, opciones y respuesta correcta son obligatorios.` };
    }
    questions.push({ question, options, correctAnswer });
  }

  return { ok: true, questions };
}

export function validateCertificateQuiz(questions) {
  if (!Array.isArray(questions) || questions.length !== 10) {
    return 'La evaluación para certificado debe tener exactamente 10 preguntas.';
  }

  const invalidIndex = questions.findIndex(question => {
    const options = question?.options;
    return !cleanText(question?.question)
      || !Array.isArray(options)
      || options.length < 3
      || options.some(option => !cleanText(option))
      || !Number.isInteger(question?.correctAnswer)
      || question.correctAnswer < 0
      || question.correctAnswer >= options.length;
  });
  return invalidIndex >= 0
    ? `Completa la pregunta ${invalidIndex + 1}: enunciado, todas sus opciones y una respuesta correcta.`
    : '';
}
