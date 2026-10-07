import Question from "../Question.js";
import State from "../State.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'question',
	});

	out.answerTicks = 0;		// Seconds left for the team to answer
	out.questionTicks = 0;		// Seconds left for a team to buzz in
	
	out.activateBuzzersTimeout = null;
	out.answerInterval = null;	// Interval starts when any question is presented


	// Question has been answered, return to board
	out.addKeyBinding('Enter', 'Continue',
		function(){
			this.game.setState('board');
			return true;
		},
		function(){ return !this.game.getActiveQuestion(); },
	);
	// Correct
	out.addKeyBinding('Enter', 'Correct',
		function(){
			this.stopAnswerInterval();
			this.onAnswerCorrect();
		},
		function(){ return this.game.getActiveQuestion() && this.game.getAnsweringTeam(); },
	);
	out.addKeyBinding('Backspace', 'Incorrect',
		function(){
			this.stopAnswerInterval();
			this.onAnswerIncorrect();
		},
		function(){ return this.game.getActiveQuestion() && this.game.getAnsweringTeam(); },
	);
	
	

	out.onStateEntry = async function(){

		const game = this.game;

		this.onStateExit();	// Resets timers

		this.questionTicks = game.questionTime;

		this.updateControls();

		this.activateBuzzersTimeout = setTimeout(() => {
			game.enableAllBuzzers();
		}, 1000);

		this.startAnswerInterval();

		Game.ui.toggleQuestion(game.getActiveQuestion(), false);

		console.log(game.activeQuestionType);
		// Immediately start the team answer timer
		if( game.activeQuestionType === Question.Type.DailyDouble )
			this.activateActiveTeamAnswerCountdown();
			

	};
	out.onStateExit = async function(){

		const game = this.game;
		this.stopAnswerInterval();
		clearTimeout(this.activateBuzzersTimeout);

	};

	// marks a team as "answering", coloring the answer box and starting the player timer
	out.activateActiveTeamAnswerCountdown = function(){

		Game.ui.toggleQuestionActive(this.game.getAnsweringTeam());
		const aTime = this.getAnswerTime();
		this.answerTicks = aTime;
		Game.ui.setQuestionTimeLeft(aTime, aTime);
		this.updateControls();

	};

	out.onRemoteButton = function( teamColor ){
		
		const game = this.game;
		const team = game.getTeamByColor(teamColor);
		if( !team )
			return;

		if( !game.getAnsweringTeam() ){

			game.disableAllBuzzers();
			game.setAnsweringTeam(team);
			this.activateActiveTeamAnswerCountdown();

		}


	};

	out.getAnswerTime = function(){
		if( this.game.activeQuestionType === Question.Type.Regular )
			return this.game.answerTime;
		return 30;
	};

	// this.setActiveQuestionCompleted();
	out.startAnswerInterval = function(){

		const game = this.game;

		this.stopAnswerInterval();
		if( !this.answerTicks && !this.questionTicks )
			return;

		this.answerInterval = setInterval(() => {
			
			const answeringTeam = game.getAnsweringTeam();
			if( answeringTeam ){

				if( !(--this.answerTicks) )
					this.onAnswerTimedOut();
				
				Game.ui.setQuestionTimeLeft(this.answerTicks, this.getAnswerTime());

			}
			else if( game.activeQuestionType === Question.Type.Regular ){
				
				if( !(--this.questionTicks) )
					this.onQuestionTimedOut();
				
			}
			

		}, 1000);

	};
	out.stopAnswerInterval = function(){
		clearInterval(this.answerInterval);
		this.answerInterval = null;
	};

	// called from correct, incorrect, and timed out 
	out.onResult = function(){
		
		this.stopAnswerInterval();

	};

	out.onAnswerCorrect = function(){
		const game = this.game;

		this.onResult();

		const question = game.getActiveQuestion();
		const team = game.getAnsweringTeam();
		if( !question || !team )
			return;

		game.lastAnswerCorrect = true;
		game.setActiveQuestionCompleted();

		if( game.activeQuestionType === Question.Type.DailyDouble )
			game.setState('dailyDoubleCompleted');
		else{
			
			team.score += question._value;
			game.onTeamScoreChanged(team);

		}

		game.categoryTeam = team.color;
		Game.ui.toggleQuestionActive(team);	// Colorizes the answer so we know who got the right answer
		this.updateControls();

	};	
	

	out.onAnswerIncorrect = function(){
		const game = this.game;

		this.onResult();

		const question = game.getActiveQuestion();
		const team = game.getAnsweringTeam();
		if( !question || !team )
			return;

		this.lastAnswerCorrect = false;
		team.buzzerEnabled = false;				// Other teams can still answer if it's a normal question

		if( game.activeQuestionType === Question.Type.DailyDouble ){

			this.onQuestionTimedOut();		// Shows the answer
			Game.ui.toggleQuestionActive(team);	// Colorizes the answer so we know who got the right answer
			game.setState('dailyDoubleCompleted');

		}
		else{

			team.score -= question._value;
			game.onTeamScoreChanged(team);
			game.setAnsweringTeam(false);

			// There are teams left
			const remainingTeams = game.getTeamsThatCanAnswer();
			if( remainingTeams.length ){

				this.startAnswerInterval();
				Game.ui.toggleQuestionActive(false);
				game.updateBuzzers();

			}
			// No teams left
			else{
				this.onQuestionTimedOut();
			}

		}
		//this.updateControls();

	};

	// No player buzzed in, and we ran out of time
	out.onQuestionTimedOut = function(){

		this.onResult();
		this.game.setActiveQuestionCompleted();
		this.updateControls();

	};

	// Player has buzzed in and the answer time has run out. We need to wait for the judge.
	out.onAnswerTimedOut = function(){
		this.stopAnswerInterval();
	};

	return out;

};



