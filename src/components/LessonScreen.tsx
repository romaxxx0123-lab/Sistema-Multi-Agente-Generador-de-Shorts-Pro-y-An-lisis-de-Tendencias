import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { ProgressBar } from './ProgressBar';
import { Button } from './Button';
import { CheckCircle2, XCircle, Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { Character } from './Character';

export const LessonScreen: React.FC = () => {
  const {
    activeLesson,
    currentQuestionIndex,
    hearts,
    loseHeart,
    nextQuestion,
    finishLesson,
    exitLesson
  } = useStore();

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');

  if (!activeLesson) return null;

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

  const currentQuestion = activeLesson.questions[currentQuestionIndex];
  const progress = (currentQuestionIndex) / activeLesson.questions.length;

  const handleCheck = () => {
    if (!selectedOption) return;

    const option = currentQuestion.options.find(o => o.id === selectedOption);
    if (option?.isCorrect) {
      setStatus('correct');
    } else {
      setStatus('incorrect');
      loseHeart();
    }
  };

  const handleContinue = () => {
    if (currentQuestionIndex + 1 < activeLesson.questions.length) {
      setSelectedOption(null);
      setStatus('idle');
      nextQuestion();
    } else {
      finishLesson();
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

      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-3xl mx-auto w-full">
        <div className="flex flex-col md:flex-row items-center gap-8 w-full">
          <Character size={120} expression={status === 'incorrect' ? 'sad' : status === 'correct' ? 'happy' : 'neutral'} />

          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, x: 20 }}
            animate={status === 'incorrect' ? {
              x: [0, -10, 10, -10, 10, 0],
              transition: { duration: 0.4 }
            } : { opacity: 1, x: 0 }}
            className="flex-1 w-full"
          >
            <h2 className="text-3xl font-bold mb-8 text-center md:text-left">
              {currentQuestion.prompt}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestion.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => status === 'idle' && setSelectedOption(option.id)}
                  className={`
                    p-4 border-2 rounded-2xl text-left font-bold text-lg transition-all
                    ${selectedOption === option.id
                      ? 'border-duo-blue bg-blue-50 text-duo-blue shadow-[0_4px_0_0_#1cb0f6]'
                      : 'border-duo-gray-light hover:bg-gray-50 shadow-[0_4px_0_0_#e5e5e5]'}
                    active:translate-y-1 active:shadow-none
                  `}
                >
                  <span className="inline-block w-8 h-8 border-2 rounded-lg mr-4 text-center leading-7 text-sm">
                    {option.id.slice(-1)}
                  </span>
                  {option.text}
                </button>
              ))}
            </div>
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
                  <h3 className="text-2xl font-bold">¡Buen trabajo!</h3>
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
                    La respuesta correcta era: {currentQuestion.options.find(o => o.isCorrect)?.text}
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
