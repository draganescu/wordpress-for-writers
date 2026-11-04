/**
 * Writer Subscribe: upgrades signup forms to submit in place, shows the
 * scroll-triggered popup, and shows notices after redirects.
 */
( function () {
    var config = window.wsubConfig || {};
    var STORE_KEY = 'wsub_state';

    function readState() {
        try {
            return JSON.parse( window.localStorage.getItem( STORE_KEY ) ) || {};
        } catch ( e ) {
            return {};
        }
    }

    function writeState( state ) {
        try {
            window.localStorage.setItem( STORE_KEY, JSON.stringify( state ) );
        } catch ( e ) {}
    }

    /* Forms ------------------------------------------------------------ */

    function setMessage( form, text, isError ) {
        var msg = form.querySelector( '.wsub-msg' );
        if ( ! msg ) {
            return;
        }
        msg.textContent = text;
        msg.classList.toggle( 'is-error', !! isError );
    }

    function onSubmit( event ) {
        var form = event.target;
        if ( ! form.classList || ! form.classList.contains( 'wsub-form' ) || ! window.fetch ) {
            return;
        }
        event.preventDefault();

        if ( ! form.reportValidity() ) {
            return;
        }

        var button = form.querySelector( '.wsub-button' );
        var data = new window.FormData( form );
        var consent = form.querySelector( 'input[name="consent"]' );

        form.classList.add( 'is-busy' );
        button.disabled = true;
        setMessage( form, '' );

        window.fetch( config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify( {
                email: data.get( 'email' ) || '',
                source: data.get( 'source' ) || '',
                website: data.get( 'website' ) || '',
                consent: consent ? consent.checked : false,
            } ),
        } )
            .then( function ( res ) {
                return res.json().catch( function () {
                    return {};
                } );
            } )
            .then( function ( body ) {
                if ( body && body.ok ) {
                    form.classList.add( 'is-done' );
                    setMessage( form, body.message );
                    var state = readState();
                    state.subscribed = true;
                    writeState( state );
                    if ( form.closest( '.wsub-popup' ) ) {
                        window.setTimeout( closePopup, 2500 );
                    }
                } else {
                    setMessage( form, ( body && body.message ) || config.failed, true );
                }
            } )
            .catch( function () {
                setMessage( form, config.failed, true );
            } )
            .then( function () {
                form.classList.remove( 'is-busy' );
                button.disabled = false;
            } );
    }

    document.addEventListener( 'submit', onSubmit );

    /* Notice after a redirect (confirm, unsubscribe, no-JS signup) ------- */

    function showToast( text ) {
        var toast = document.createElement( 'div' );
        toast.className = 'wsub-toast';
        toast.setAttribute( 'role', 'status' );
        toast.textContent = text;
        document.body.appendChild( toast );
        window.setTimeout( function () {
            toast.classList.add( 'is-leaving' );
            window.setTimeout( function () {
                toast.remove();
            }, 400 );
        }, 5000 );
    }

    var params = new window.URLSearchParams( window.location.search );
    var notice = params.get( 'wsub_notice' );
    if ( notice && config.notices && config.notices[ notice ] ) {
        if ( 'confirmed' === notice || 'signup' === notice ) {
            var s = readState();
            s.subscribed = true;
            writeState( s );
        }
        showToast( config.notices[ notice ] );
        params.delete( 'wsub_notice' );
        var query = params.toString();
        window.history.replaceState( null, '', window.location.pathname + ( query ? '?' + query : '' ) + window.location.hash );
    }

    /* Popup ------------------------------------------------------------- */

    var popup = null;

    function closePopup() {
        if ( ! popup ) {
            return;
        }
        var state = readState();
        if ( ! state.subscribed ) {
            state.snoozedUntil = Date.now() + ( config.snoozeDays || 0 ) * 86400000;
            writeState( state );
        }
        popup.classList.remove( 'is-open' );
        var el = popup;
        window.setTimeout( function () {
            el.remove();
        }, 400 );
        popup = null;
    }

    function openPopup() {
        popup = document.createElement( 'div' );
        popup.className = 'wsub-popup';
        popup.setAttribute( 'role', 'dialog' );
        popup.setAttribute( 'aria-label', config.label || '' );
        popup.innerHTML = config.popup;

        var close = document.createElement( 'button' );
        close.type = 'button';
        close.className = 'wsub-close';
        close.setAttribute( 'aria-label', config.close );
        close.innerHTML = '<span aria-hidden="true">&times;</span>';
        close.addEventListener( 'click', closePopup );
        popup.insertBefore( close, popup.firstChild );

        popup.addEventListener( 'keydown', function ( e ) {
            if ( 'Escape' === e.key ) {
                closePopup();
            }
        } );

        document.body.appendChild( popup );
        // Next frame, so the slide-in transition runs.
        window.requestAnimationFrame( function () {
            window.requestAnimationFrame( function () {
                if ( popup ) {
                    popup.classList.add( 'is-open' );
                }
            } );
        } );
    }

    // How far through the post body the reader is, measured from the bottom
    // of the viewport so the footer and comments don't count. Falls back to
    // the whole page when the theme has no recognisable content wrapper.
    var content = document.querySelector( '.wp-block-post-content, .entry-content, article' );

    function scrolledPercent() {
        if ( content ) {
            var rect = content.getBoundingClientRect();
            if ( rect.height > 0 ) {
                return Math.min( 100, ( ( window.innerHeight - rect.top ) / rect.height ) * 100 );
            }
        }
        var doc = document.documentElement;
        var max = doc.scrollHeight - window.innerHeight;
        if ( max <= 0 ) {
            return 100;
        }
        return ( window.scrollY / max ) * 100;
    }

    function setupPopup() {
        if ( ! config.popup ) {
            return;
        }
        var state = readState();
        if ( state.subscribed || ( state.snoozedUntil && state.snoozedUntil > Date.now() ) ) {
            return;
        }

        var ticking = false;
        function check() {
            ticking = false;
            if ( scrolledPercent() >= config.scroll ) {
                window.removeEventListener( 'scroll', onScroll );
                openPopup();
            }
        }
        function onScroll() {
            if ( ! ticking ) {
                ticking = true;
                window.requestAnimationFrame( check );
            }
        }
        window.addEventListener( 'scroll', onScroll, { passive: true } );
    }

    setupPopup();
} )();
