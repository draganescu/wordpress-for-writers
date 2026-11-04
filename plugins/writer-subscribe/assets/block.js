/**
 * Subscribe form block. Rendered on the server; the editor shows a
 * preview with editable heading, text and button label.
 */
( function ( wp ) {
    var el = wp.element.createElement;
    var __ = wp.i18n.__;
    var RichText = wp.blockEditor.RichText;
    var useBlockProps = wp.blockEditor.useBlockProps;

    wp.blocks.registerBlockType( 'writer-subscribe/form', {
        edit: function ( props ) {
            var a = props.attributes;
            var set = props.setAttributes;
            var blockProps = useBlockProps();

            return el(
                'div',
                blockProps,
                el(
                    'div',
                    { className: 'wsub-form' },
                    el( RichText, {
                        tagName: 'p',
                        className: 'wsub-heading',
                        value: a.heading,
                        allowedFormats: [],
                        placeholder: __( 'Heading (uses the default when empty)', 'writer-subscribe' ),
                        onChange: function ( v ) {
                            set( { heading: v } );
                        },
                    } ),
                    el( RichText, {
                        tagName: 'p',
                        className: 'wsub-text',
                        value: a.text,
                        allowedFormats: [],
                        placeholder: __( 'Short pitch (uses the default when empty)', 'writer-subscribe' ),
                        onChange: function ( v ) {
                            set( { text: v } );
                        },
                    } ),
                    el(
                        'div',
                        { className: 'wsub-row' },
                        el( 'input', { className: 'wsub-email', type: 'email', disabled: true, placeholder: 'you@example.com' } ),
                        el( RichText, {
                            tagName: 'span',
                            className: 'wsub-button',
                            value: a.button,
                            allowedFormats: [],
                            placeholder: __( 'Subscribe', 'writer-subscribe' ),
                            onChange: function ( v ) {
                                set( { button: v } );
                            },
                        } )
                    )
                )
            );
        },
        save: function () {
            return null;
        },
    } );
} )( window.wp );
