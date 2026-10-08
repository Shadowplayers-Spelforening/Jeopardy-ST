import Question from "../Question.js";
import State from "../State.js";
import Team from "../Team.js";

// Build a state. Link it to the game via State.Prototypes
export default () => {
	
	const out = new State({
		id : 'question',
	});

	out.answerTicks = 0;		// Seconds left for the team to answer
	out.questionTicks = 0;		// Seconds left for a team to buzz in
	
	out.finalQuestionForceTimeout = null;	// Allows host to force revealing scores even if we didn't receive an answer
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

	// Correct
	out.addKeyBinding('Enter', 'Player Answers',
		function(){
			this.game.setState('finalQuestionShowTeam');
		},
		function(){ 
			return (
				this.isFinalQuestion() &&
				this.allTeamsHaveSuppliedText() || !this.answerTicks
			); 
		},
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

		// Immediately start the team answer timer
		if( game.activeQuestionType !== Question.Type.Regular )
			this.activateActiveTeamAnswerCountdown();

		if( this.isFinalQuestion() ){

			game.setAllDisplaysKeyboard();
			
		}
			

	};
	out.onStateExit = async function(){

		const game = this.game;
		this.stopAnswerInterval();
		clearTimeout(this.finalQuestionForceTimeout);
		clearTimeout(this.activateBuzzersTimeout);

	};

	// colors the answer box to active team (if supplied) and starts the visual timer
	out.activateActiveTeamAnswerCountdown = function(){

		const team = this.game.getAnsweringTeam();

		Game.ui.toggleQuestionActive( team || true );

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
		if( this.isFinalQuestion() )
			return 60;
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
			// Ticks down player answer time (or final question time)
			if( answeringTeam || this.isFinalQuestion() ){

				if( !(--this.answerTicks) )
					this.onAnswerTimedOut();
				
				Game.ui.setQuestionTimeLeft(this.answerTicks, this.getAnswerTime());

			}
			// Ticks down waiting for a player to buzz in
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

	out.isFinalQuestion = function(){ return this.game.isFinalQuestion(); };

	// Player has buzzed in and the answer time has run out. We need to wait for the judge.
	// This also calls at the end of the final question
	out.onAnswerTimedOut = function(){
		this.stopAnswerInterval();

		if( this.isFinalQuestion() ){

			// Request texts from the teams
			this.game.getAllTexts();
			this.finalQuestionForceTimeout = setTimeout(() => {
				
				for( let team of this.game.teams ){
					if( !team.lastText )
						team.lastText = '...';
				}
				this.updateControls();

			}, 5000);

		}

	};

	out.allTeamsHaveSuppliedText = function(){

		return this.game.teams.every(team => !team.active || team.lastText);

	};

	// text received from buzzer
	out.onRemoteText = async function( teamColor, text ){
			
		const game = this.game;
		if( !this.isFinalQuestion() )
			return;

		const team = game.getTeamByColor(teamColor);
		if( !team )
			return;

		team.lastText = String(text).trim();

		this.updateControls();
		if( this.allTeamsHaveSuppliedText() ){
			
			this.stopAnswerInterval();
			Game.ui.toggleQuestionActive(false);

		}

	};

	return out;

};



