/**
 * Paywall block. A marker: everything after it is for members. Rendered on
 * the server as the upgrade box, for readers without access only.
 */
( function ( wp ) {
    var el = wp.element.createElement;
    var __ = wp.i18n.__;
    var useBlockProps = wp.blockEditor.useBlockProps;

    var line = { flex: 1, borderTop: '1px dashed currentColor', opacity: 0.4 };

    wp.blocks.registerBlockType( 'writer-members/paywall', {
        edit: function () {
            var blockProps = useBlockProps( {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75em',
                    margin: '2em 0',
                    fontSize: '0.8em',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    opacity: 0.75,
                },
            } );
            return el(
                'div',
                blockProps,
                el( 'span', { style: line } ),
                el( 'span', null, '🔒 ' + __( 'Members only below', 'writer-members' ) ),
                el( 'span', { style: line } )
            );
        },
        save: function () {
            return null;
        },
    } );
} )( window.wp );
