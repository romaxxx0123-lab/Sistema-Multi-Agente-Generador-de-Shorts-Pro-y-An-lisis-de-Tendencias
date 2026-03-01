import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { ProgressBar } from './ProgressBar';
import { Button } from './Button';
import { CheckCircle2, XCircle, Heart, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Character } from './Character';
import { MultipleChoiceExercise } from './exercises/MultipleChoiceExercise';
import { ImageSelectionExercise } from './exercises/ImageSelectionExercise';
import { MatchingExercise } from './exercises/MatchingExercise';
import { SentenceBuilderExercise } from './exercises/SentenceBuilderExercise';
import { TrueFalseExercise } from './exercises/TrueFalseExercise';

export const LessonScreen: React.FC = () => {
  const {
    activeLesson,
    currentQuestionIndex,
    hearts,
    loseHeart,
    nextQuestion,
    finishLesson,
    exitLesson,
    isReviewPhase,
    missedQuestionIndices
  } = useStore();

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect' | 'completed'>('idle');

  if (!activeLesson) return null;

  if (status === 'completed') {
    return (
      <div className="fixed inset-0 bg-white z-[60] flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-duo-yellow p-8 rounded-3xl shadow-xl flex flex-col items-center mb-8 border-b-8 border-duo-yellow-dark"
        >
          <div className="bg-white rounded-full p-6 mb-4 shadow-lg border-b-4 border-duo-gray-light">
             <Trophy size={80} className="text-duo-yellow" fill="currentColor" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 uppercase tracking-tight">Lección Completada</h1>
          <p className="text-white font-bold opacity-80 text-xl">+15 XP • 100% Precisión</p>
        </motion.div>

        <Character size={180} expression="wink" />
        <h2 className="text-3xl font-bold mt-8 text-duo-gray-dark">¡Impresionante!</h2>
        <p className="text-xl text-duo-gray mt-4 max-w-md">
          Has dominado esta lección. Cada paso te acerca más a ser un experto mecánico.
        </p>

        <div className="mt-12 w-full max-w-xs">
          <Button variant="primary" size="lg" className="w-full" onClick={finishLesson}>
            CONTINUAR
          </Button>
        </div>
      </div>
    );
  }

  if (hearts === 0) {
    return (
      <div className="fixed inset-0 bg-white z-[60] flex flex-col items-center justify-center p-6 text-center">
        <Character size={150} expression="sad" />
        <h1 className="text-4xl font-bold mt-8 text-duo-gray-dark">¡Te quedaste sin vidas!</h1>
        <p className="text-xl text-duo-gray mt-4 max-w-md">
          ¡No te rindas! Los mejores mecánicos también cometen errores. Recupera tus vidas y vuelve a intentarlo.
        </p>
        <div className="mt-12 flex flex-col gap-4 w-full max-w-xs">
          <Button variant="primary" size="lg" onClick={() => {
            useStore.getState().resetHearts();
          }}>
            Recargar vidas
          </Button>
          <Button variant="secondary" size="lg" onClick={exitLesson}>
            Salir por ahora
          </Button>
        </div>
      </div>
    );
  }

  const currentQuestion = isReviewPhase
    ? activeLesson.questions[missedQuestionIndices[currentQuestionIndex]]
    : activeLesson.questions[currentQuestionIndex];

  const progress = isReviewPhase
    ? 0.9 + (currentQuestionIndex / (missedQuestionIndices.length || 1)) * 0.1
    : (currentQuestionIndex) / activeLesson.questions.length;

  const handleCheck = () => {
    if (currentQuestion.type === 'matching') {
        // Matching is handled by onComplete internal logic
        return;
    }

    if (currentQuestion.type === 'sentence-builder') {
        // Already checked internally or waiting for button press?
        // Let's assume the button press triggers the check for sentence-builder
        return;
    }

    if (currentQuestion.type === 'true-false') {
        return;
    }

    if (!selectedOption) return;

    const option = currentQuestion.options?.find(o => o.id === selectedOption);
    if (option?.isCorrect) {
      setStatus('correct');
    } else {
      setStatus('incorrect');
      loseHeart(isReviewPhase ? missedQuestionIndices[currentQuestionIndex] : currentQuestionIndex);
    }
  };

  const handleContinue = () => {
    const totalQuestions = isReviewPhase ? missedQuestionIndices.length : activeLesson.questions.length;

    if (currentQuestionIndex + 1 < totalQuestions) {
      setSelectedOption(null);
      setStatus('idle');
      nextQuestion();
    } else if (!isReviewPhase && missedQuestionIndices.length > 0) {
      // Transition to review phase handled by nextQuestion in store
      setSelectedOption(null);
      setStatus('idle');
      nextQuestion();
    } else {
      setStatus('completed');
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 max-w-5xl mx-auto w-full">
        <ProgressBar progress={progress} onClose={exitLesson} />
        <div className="flex items-center gap-2 text-duo-red font-bold text-xl px-4">
          <Heart fill="currentColor" />
          {hearts}
        </div>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-5xl mx-auto w-full overflow-y-auto">
        <div className="w-full flex flex-col gap-8">
          <div className="flex flex-col md:flex-row items-center gap-8 w-full">
            <div className="relative group shrink-0">
               <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white border-2 border-duo-gray-light px-4 py-2 rounded-2xl font-bold text-lg shadow-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                  ¡Vamos, tú puedes!
                  <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[10px] border-t-duo-gray-light"></div>
               </div>
               <Character size={120} expression={status === 'incorrect' ? 'sad' : status === 'correct' ? 'happy' : 'neutral'} />
            </div>

            <h2 className="text-3xl font-bold text-center md:text-left text-duo-gray-dark flex-1">
              {currentQuestion.prompt}
            </h2>
          </div>

          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, y: 20 }}
            animate={status === 'incorrect' ? {
              x: [0, -10, 10, -10, 10, 0],
              transition: { duration: 0.4 }
            } : { opacity: 1, y: 0 }}
            className="w-full"
          >
            <AnimatePresence mode="wait">
               {currentQuestion.type === 'multiple-choice' && (
                  <MultipleChoiceExercise
                    key="mc"
                    options={currentQuestion.options || []}
                    selectedId={selectedOption}
                    onSelect={setSelectedOption}
                    status={status as any}
                  />
               )}
               {currentQuestion.type === 'image-selection' && (
                  <ImageSelectionExercise
                    key="is"
                    options={currentQuestion.options || []}
                    selectedId={selectedOption}
                    onSelect={setSelectedOption}
                    status={status as any}
                  />
               )}
               {currentQuestion.type === 'matching' && (
                  <MatchingExercise
                    key="me"
                    pairs={currentQuestion.pairs || []}
                    onComplete={() => setStatus('correct')}
                    onIncorrect={() => loseHeart(isReviewPhase ? missedQuestionIndices[currentQuestionIndex] : currentQuestionIndex)}
                  />
               )}
               {currentQuestion.type === 'sentence-builder' && (
                  <SentenceBuilderExercise
                    key="sb"
                    sentence={currentQuestion.sentence || []}
                    correctOrder={currentQuestion.correctOrder || []}
                    onCorrect={(isCorrect) => {
                       if (isCorrect) setStatus('correct');
                       else {
                         setStatus('incorrect');
                         loseHeart(isReviewPhase ? missedQuestionIndices[currentQuestionIndex] : currentQuestionIndex);
                       }
                    }}
                    status={status as any}
                  />
               )}
               {currentQuestion.type === 'true-false' && (
                  <TrueFalseExercise
                    key="tf"
                    isTrue={currentQuestion.isTrue || false}
                    onSelect={(userChoice) => {
                       if (userChoice === currentQuestion.isTrue) setStatus('correct');
                       else {
                         setStatus('incorrect');
                         loseHeart(isReviewPhase ? missedQuestionIndices[currentQuestionIndex] : currentQuestionIndex);
                       }
                    }}
                    status={status as any}
                  />
               )}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>

      <footer className={`
        p-6 border-t-2 transition-colors duration-300
        ${status === 'correct' ? 'bg-green-100 border-green-200' :
          status === 'incorrect' ? 'bg-red-100 border-red-200' :
          'bg-white border-duo-gray-light'}
      `}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {status === 'correct' && (
              <div className="flex items-center gap-3 text-duo-green-dark">
                <div className="bg-white rounded-full p-1"><CheckCircle2 size={40} /></div>
                <div>
                  <h3 className="text-2xl font-bold">
                    {isReviewPhase ? '¡Corregido!' : '¡Buen trabajo!'}
                  </h3>
                  <p className="font-medium">{currentQuestion.explanation}</p>
                </div>
              </div>
            )}
            {status === 'incorrect' && (
              <div className="flex items-center gap-3 text-duo-red-dark">
                <div className="bg-white rounded-full p-1"><XCircle size={40} /></div>
                <div>
                  <h3 className="text-2xl font-bold">Respuesta incorrecta</h3>
                  <p className="font-medium">
                    {currentQuestion.type === 'true-false'
                      ? `Era ${currentQuestion.isTrue ? 'Verdadero' : 'Falso'}`
                      : `La respuesta correcta era: ${currentQuestion.options?.find(o => o.isCorrect)?.text || 'otra'}`
                    }
                  </p>
                </div>
              </div>
            )}
          </div>

          <Button
            variant={status === 'incorrect' ? 'danger' : status === 'correct' ? 'primary' : 'primary'}
            size="lg"
            className="w-full md:w-auto min-w-[150px]"
            onClick={status === 'idle' ? handleCheck : handleContinue}
            disabled={!selectedOption && status === 'idle'}
          >
            {status === 'idle' ? 'Comprobar' : 'Continuar'}
          </Button>
        </div>
      </footer>
    </div>
  );
};
